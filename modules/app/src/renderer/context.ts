import { defined, Drafting, YGOPROCardInfo } from '@picky/shared'
import React, { useEffect, useState } from 'react'
import { Observable, Subject } from 'rxjs'
import { io, Socket } from 'socket.io-client'
import useLocalStorage from 'use-local-storage'
import { Keys } from './misc'

export interface SessionState {
  online: boolean
  bound?: Drafting.ParticipantInfo
  room?:  Drafting.RoomInfo
}

type SelectionState = { state: 'confirmed'; picks: Drafting.PickCandidate[] }
                    | { state: 'pending';   picks: undefined }
export interface DraftingState {
  id:           string
  participants: Drafting.ParticipantInfo[]
  complete:     boolean
  pickreqs:     Record<string, Drafting.PickRequest>
  selections:   Record<string, SelectionState | undefined>
  progress:     Record<string, Array<Drafting.ParticipantInfo & { done: boolean }>>
  stables:      YGOPROCardInfo[]
  unstables:    Record<string, YGOPROCardInfo[]>
}

export interface AppContext {
  session:   SessionState
  drafting?: DraftingState
  rooms:     Drafting.BaseRoomInfo[]
  dbcache:   Record<number, YGOPROCardInfo>

  update: {
    cache:    (info: YGOPROCardInfo)        => void
    online:   (s: SessionState['online'])   => void
    room:     (s: SessionState['room'])     => void
    bound:    (s: SessionState['bound'])    => void

    rooms:    (s: Drafting.BaseRoomInfo[])  => void
    refresh:  () => void

    cleardraft: () => void

    pickreq:  (s: Drafting.PickRequest)               => void
    recover:  (s: Drafting.MsgOf<'s_draft_recover'>)  => void
    complete: (s: Drafting.MsgOf<'s_draft_complete'>) => void
    progress: (s: Drafting.MsgOf<'s_pick_progress'>)  => void

    select:   (draft_id: string, req_id: string, picks: Drafting.PickCandidate[]) => void

    prepick:  (req_id: string, candidate: Drafting.PickCandidate[]) => void
  }

  socket: Socket
  rx$:    Observable<Drafting.S_Msg>

  request: <Tag extends keyof Drafting.C_MsgDefs>(
    tag:  Tag,
    body: Omit<Drafting.C_MsgDefs[Tag], 'tag'>
  ) => Promise<Drafting.AckBodyOf<Tag>>

  handle: (e: Error) => void
}

export const AppContext = React.createContext<AppContext>(undefined as unknown as AppContext)

export class ErrorWithCode extends Error {
  constructor(readonly code: string, message: string) {
    super(`错误: ${code} - ${message}`)
  }
}

export function hasCode(e: Error): e is ErrorWithCode {
  return `code` in e
}

export function initialize() {
  // fix <loading> for older version
  const image_id = +localStorage.getItem(Keys.AVATAR)!
  if (!image_id) {
    localStorage.setItem(Keys.AVATAR, '24154052' /* 原型机灵 */)
  }

  const socket = io(localStorage.getItem('SERVER_URL') || 'http://49.232.147.104:5003')
  const rx$    = new Subject<Drafting.S_Msg>()

  const request: AppContext['request'] = (tag, body) => {
    return new Promise<any>((resolve, reject) => {
      console.log(`=> ${tag}.req`, body)

      socket.emit('M', { tag, ...body }, (resp: Drafting.Ack) => {
        if (resp.status === 'ok') {
          console.log(`<= ${tag}.${resp.status}`, resp.data)
          return resolve(resp.data)
        } else {
          console.log(`<= ${tag}.${resp.status} ${resp.code} ${resp.message}`)
          return reject(new ErrorWithCode(resp.code, resp.message))
        }
      })
    })
  }

  socket.on('M', (msg: Drafting.S_Msg, ack?: ({}) => any) => {
    const { tag, ...body } = msg
    console.log(`<= ${tag}.req${ack ? ' [ack required]' : ''}`, body)
    ack && ack(Drafting.okack(msg.tag, {}))

    rx$.next(msg)
  })

  return { socket, rx$, request }
}

export function useAppState(
  { socket, request, rx$, handle }: Pick<AppContext, 'socket' | 'request' | 'rx$' | 'handle'>
): AppContext {
  const [session,  updateSession]  = useState<SessionState>({ online: socket.connected })
  const [drafting, updateDrafting] = useState<DraftingState>()
  const [rooms,    updateRooms]    = useState<Drafting.BaseRoomInfo[]>([])
  const [dbcache,  updateDbCache]  = useState<Record<number, YGOPROCardInfo>>({})

  type U<K extends keyof AppContext['update']> = AppContext['update'][K]

  const refresh: U<'refresh'> = () => {
    if (!session.bound) { return }
    request('c_poll_rooms', {})
      .then(updateRooms)
      .catch(e => console.error(e))
  }

  const online: U<'online'> = online => updateSession(s => ({ ...s, online }))
  const bound:  U<'bound'>  = bound  => updateSession(s => ({ ...s, bound }))
  const room:   U<'room'>   = room   => updateSession(s => ({ ...s, room }))

  const pickreq: U<'pickreq'> = pickreq => updateDrafting(s => ({
    id:           pickreq.draft_id,
    participants: s?.participants ?? [],
    progress:     s?.progress ?? {},
    complete:     false,
    pickreqs:     { ...s?.pickreqs, [pickreq.req_id]: pickreq },
    selections:   { ...s?.selections, [pickreq.req_id]: undefined },
    stables:      s?.stables   ?? [],
    unstables:    s?.unstables ?? {}
  }))

  const select: U<'select'> = async (draft_id, req_id, picks) => {
    updateDrafting(s => s && ({
      ...s,
      selections: {
        ...s.selections, [req_id]: s.selections[req_id]?.state !== 'confirmed'
          ? { state: 'pending', picks: undefined } : s.selections[req_id]
      }
    }))

    try {
      await request('c_pick_selection', { draft_id, req_id, picks: picks.map(c => c.id) })
      updateDrafting(s => {
        if (!s) { return s }

        const { [req_id]: _, ...unstables } = s.unstables
        return {
          ...s,
          selections: { ...s.selections, [req_id]: { state: 'confirmed', picks } },
          unstables,
          stables:  s.stables.concat(
            picks
              .flatMap(c => c.pack)
              .map(c => {
                const hit = dbcache[c]
                if (hit) { return hit }

                const info = window.ipc.queryCardInfoSync(c)
                if (info) {
                  updateDbCache(s => ({ ...s, [info.code]: info }))
                }

                return info
              })
              .filter(defined)),
        }
      })
    } catch {
      updateDrafting(s => s && ({
        ...s,
        selections: {
          ...s.selections,
          [req_id]: s.selections[req_id]?.state !== 'confirmed'
            ? undefined : s.selections[req_id]
        }
      }))
    }
  }

  const progress: U<'progress'> = prog => updateDrafting(s => s && ({
    ...s,
    progress: { ...s.progress, [prog.req_id]: prog.participants }
  }))

  const complete: U<'complete'> = complete => updateDrafting(s => s && ({
    ...s,
    complete: true,
    stables:  complete.picks.flatMap(c => c.pack).map(window.ipc.queryCardInfoSync).filter(defined)
  }))

  const prepick: U<'prepick'> = (req_id, candidates) => updateDrafting(s => {
    if (!s) { return undefined }

    return {
      ...s, unstables: { ...s.unstables, [req_id]: candidates.flatMap(c => c.pack).map(window.ipc.queryCardInfoSync).filter(defined) }
    }
  })

  const recover: U<'recover'> = recover => updateDrafting(s => ({
    id:           recover.draft_id,
    participants: recover.participants,
    progress:     s?.progress ?? {},
    complete:     false,
    pickreqs:     s?.pickreqs ?? {},
    selections:   s?.selections ?? {},
    unstables:    s?.unstables ?? {},
    stables:      recover.picks.flatMap(c => c.pack).map(window.ipc.queryCardInfoSync).filter(defined),
    deck:         []
  }))

  const cleardraft: U<'cleardraft'> = () => updateDrafting(undefined)

  const cache: U<'cache'> = (info: YGOPROCardInfo) => updateDbCache(s => ({ ...s, [info.code]: info }))

  useEffect(() => refresh(), [session.bound, !!drafting])

  return {
    session, drafting, rooms, dbcache,
    socket,
    rx$,
    request,
    handle,
    update: {
      cache,
      online,
      bound,
      room,
      pickreq,
      recover,
      complete,
      select,
      progress,
      prepick,
      cleardraft,
      refresh,
      rooms: s => updateRooms(s)
    },
  }
}

export function handleSessionState(
  userinfo: { uuid: string;  secret: string; image_id: number },
  { request, socket, rx$, update, dbcache }: AppContext
) {
  const rebind = () => {
    request('c_bind', userinfo)
      .then(r => update.bound({ uuid: r.uuid, image_id: r.image_id }))
      .catch(e => console.error(`c_bind failed: ${e.code}`))
  }

  if (socket.connected) { rebind() }

  const onStateChange = () => {
    update.bound(undefined)
    update.room(undefined)
    update.cleardraft()

    if (socket.connected) { rebind() }

    update.online(socket.connected)
  }

  socket.on('connect', onStateChange)
  socket.on('disconnect', onStateChange)

  const subscription = rx$.subscribe(msg => {
    if (msg.tag === 's_pick_request' || msg.tag === 's_draft_recover') {
      const candidates = msg.tag === 's_draft_recover' ? msg.picks
                       :                                 msg.candidates

      for (const c of candidates) {
        for (const code of c.pack) {
          if (dbcache[code]) { continue }

          window.ipc.queryCardInfo(code).then(info => {
            if (info) { update.cache(info) }
          })
        }
      }
    }

    if (msg.tag === 's_pick_request')   { return update.pickreq(msg)    }
    if (msg.tag === 's_room_info')      { return update.room(msg)       }
    if (msg.tag === 's_room_expired')   { return update.room(undefined) }
    if (msg.tag === 's_draft_recover')  { return update.recover(msg)    }
    if (msg.tag === 's_draft_complete') { return update.complete(msg)   }
    if (msg.tag === 's_pick_progress')  { return update.progress(msg)   }
  })

  return () => {
    socket.removeListener('connect',    onStateChange)
    socket.removeListener('disconnect', onStateChange)
    subscription.unsubscribe()
  }
}

export interface DeckReg {
  draft_id:  string
  timestamp: number
  lskey:     string
}

export interface DeckInfo {
  draft_id: string
  list:     number[]
}

export function useDeckList() {
  const [decks, setDecks] = useLocalStorage<DeckReg[]>(Keys.DECKS, [])
  const put = (d: DeckReg) => setDecks(ds => ds.concat([d]))
  const del = (d: DeckReg) => setDecks(ds => ds.filter(i => i.draft_id !== d.draft_id))
  return { decks, put, del }
}

export function saveDeck(
  draft_id: string,
  list:     number[],
  put:      (d: DeckReg) => void
) {
  const reg: DeckReg   = { draft_id, timestamp: Date.now(), lskey: 'v1:deck:' + draft_id }
  const deck: DeckInfo = { draft_id, list }
  put(reg)

  localStorage.setItem(reg.lskey, JSON.stringify(deck))
}

export function getDeck(r: DeckReg) {
  const content = localStorage.getItem(r.lskey)
  if (!content) { return undefined }
  try {
    return JSON.parse(content) as DeckInfo
  } catch {
    return undefined
  }
}
