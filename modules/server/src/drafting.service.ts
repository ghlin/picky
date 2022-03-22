import { flatten, Logger } from '@nestjs/common'
import { Drafting, tuple } from '@picky/shared'
import { firstValueFrom, identity, Subject } from 'rxjs'
import { inspect } from 'util'
import { DispatchingPreset, DispatchSchema, DraftDispatching, SealedDispatching } from './dispatching.interface'

const expand = (d: {}) => inspect(d, false, null, false)

export class DraftingSession {
  logger   = new Logger(`dss:${this.id}`)
  supplier = 0
  abort$ = new Subject<void>()

  participants: Array<{
    uuid:       string
    image_id:   number
    selections: Record<
      string, /*  req_id (+shift_id) */
      Drafting.PickCandidate[]
    >
  }>

  constructor(
    readonly id:     string,
    readonly preset: DispatchingPreset,
    readonly _emit: (
      uuid:    string,
      message: Drafting.Msg
    ) => Promise<Drafting.AckBody>
  ) {}

  async emit<T = unknown>(uuid: string, message: Drafting.Msg) {
    const { tag: _tag1, ...msgdump } = message
    this.logger.debug(`${message.tag}.req -> ${uuid} ${expand(msgdump)}`)

    const resp = await Promise.race([this._emit(uuid, message), firstValueFrom(this.abort$)])

    if (!resp) { throw new Error(`Abort`) }
    this.logger.debug(`${message.tag}.ack <- ${uuid} ${expand(resp)}`)

    return resp as unknown as T
  }

  async broadcast<T = unknown>(message: Drafting.Msg) {
    const responses = await Promise.all(this.participants.map(async ({ uuid }) => {
      const response = await this.emit(uuid, message)
      return tuple(uuid, response as unknown as T)
    }))
    return Object.fromEntries(responses)
  }

  async start() {
    await this.broadcast(Drafting.mkmsg('s_draft_did_start', {
      draft_id:     this.id,
      participants: this.participants,
      preset: {
        id:          this.preset.id,
        name:        this.preset.name,
        description: this.preset.description
      }
    }))
    this.logger.debug(`started...`)
    await this._dispatch(this.preset.schema)
    this.logger.debug(`complete...`)

    await Promise.all(this.participants.map(p => {
      const picks = flatten(Object.values(p.selections))
      this.logger.debug(`sending picks to ${p.uuid}, ${picks.length} picks...`)
      return this.emit(p.uuid, Drafting.mkmsg('s_draft_complete', { draft_id: this.id, picks }))
    }))
    await this.broadcast(Drafting.mkmsg('s_draft_did_stop', { draft_id: this.id }))
  }

  async abort() {
    this.abort$.next()
    await this.broadcast(Drafting.mkmsg('s_draft_did_stop', { draft_id: this.id }))
    await this.broadcast(Drafting.mkmsg('s_draft_complete', { draft_id: this.id, picks: [] }))
  }

  private async _dispatch(d: DispatchSchema) {
    this.logger.debug(`_dispatch ${d.tag} [${this.supplier}]`)

    if (d.tag === 'atom_dispatch') {
      const req_id = (++this.supplier).toString()
      const dispatching = await d.dispatcher.dispatch(
        this.participants.map((p, id) => ({ id, picked: Object.values(p.selections).flatMap(identity) }))
      )

      if (dispatching.tag === 'draft_dispatching') {
        await this._draft(dispatching, req_id)
      } else {
        await this._sealed(dispatching, req_id)
      }

      await this.broadcast(Drafting.mkmsg('s_pick_complete', { draft_id: this.id, req_id }))
    } else if (d.tag === 'fork_dispatch') {
      await Promise.all(d.children.map(sub => this._dispatch(sub)))
    } else {
      for (const sub of d.children) { await this._dispatch(sub) }
    }
  }

  private async _sealed(d: SealedDispatching, req_id: string) {
    this.logger.debug(`_sealed dispatching, req_id = ${req_id}, npicks = ${d.npicks.min}~${d.npicks.max}`)
    await Promise.all(this.participants.map(async (p, i) => {
      const pickreq = Drafting.mkmsg('s_pick_request', {
        ptype:      'sealed',
        meta:       { title: d.title },
        candidates: d.dispatches[i],
        npicks:     d.npicks,
        draft_id:   this.id,
        req_id
      })

      do {
        const selection = await this.emit<Drafting.PickSelection>(p.uuid, pickreq)
        const picks     = pickreq.candidates.filter(c => selection.picks.includes(c.id))

        if (picks.length > d.npicks.max || picks.length < d.npicks.min) {
          this.logger.warn(`invalid pick, uuid = ${p.uuid}, npicks = ${d.npicks.min}~${d.npicks.max}, picked = ${picks.length}`)
          await this.emit(p.uuid, Drafting.mkmsg('s_error', { code: 'NPICKS_MISMATCH', message: '...' }))
          continue
        }

        p.selections[req_id] = picks
        return this._picked(p.uuid, req_id)
      } while (true)
    }))
  }

  private async _draft(d: DraftDispatching, rprefix: string) {
    const dispatches    = d.dispatches
    const nparticipants = this.participants.length
    const modpad        = nparticipants * d.shifts.length // better: LCM(nparticipants, d.shifts.length)

    for (let shiftoff = 0; shiftoff !== d.shifts.length; ++shiftoff) {
      const req_id = rprefix + ':' + shiftoff
      this.logger.debug(`_draft dispatching, req_id = ${req_id}, shift = ${shiftoff}/${d.shifts.length}, npicks = ${d.shifts[shiftoff]}`)

      await Promise.all(this.participants.map(async (p, i) => {
        const index      = (modpad + i - shiftoff) % nparticipants
        const candidates = dispatches[index]
        const previdx    = (modpad + i - 1) % nparticipants
        const nextidx    = (modpad + i + 1) % nparticipants
        const prev       = shiftoff     === 0               ? undefined : this.participants[previdx].uuid
        const next       = shiftoff + 1 === d.shifts.length ? undefined : this.participants[nextidx].uuid

        const pickreq = Drafting.mkmsg('s_pick_request', {
          ptype:    'draft',
          meta:     { shift: { index: shiftoff, total: d.shifts.length, prev, next } },
          npicks:   d.shifts[shiftoff],
          draft_id: this.id,
          req_id,
          candidates
        })

        do {
          const selection = await this.emit<Drafting.PickSelection>(p.uuid, pickreq)
          const picks     = candidates.filter(c =>  selection.picks.includes(c.id))

          if (picks.length !== pickreq.npicks) {
            this.logger.warn(`invalid pick, uuid = ${p.uuid}, npicks = ${pickreq.npicks}, picked = ${picks.length}`)
            await this.emit(p.uuid, Drafting.mkmsg('s_error', { code: 'NPICKS_MISMATCH', message: '...' }))
            continue
          }

          p.selections[req_id] = picks
          dispatches[index]    = candidates.filter(c => !selection.picks.includes(c.id))

          this._picked(p.uuid, req_id)
          return
        } while (true)
      }))
    }
  }

  private async _picked(who: string, req_id: string) {
    await Promise.all([
      this.broadcast(Drafting.mkmsg('s_participant_did_pick', { draft_id: this.id, req_id, who })),
      this.broadcast(Drafting.mkmsg('s_pick_progress', {
        draft_id: this.id,
        req_id,
        participants: this.participants.map(p => ({ uuid: p.uuid, image_id: p.image_id, done: !!p.selections[req_id] }))
      }))
    ])
  }
}
