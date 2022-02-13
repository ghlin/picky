import { Logger } from '@nestjs/common'
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Drafting, ValueType, withTimeout } from '@picky/shared'
import { randomBytes } from 'crypto'
import { flatten } from 'ramda'
import { firstValueFrom, Subject } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { Server, Socket } from 'socket.io'
import { DraftingSession } from './drafting.service'
import { PresetService } from './preset.service'
import { DSError } from './util'

const RECONNECT_TIMEOUT = 60 * 1000

declare module 'socket.io' {
  interface Socket { session: ValueType<DraftGateway['clients']> }
}

interface DraftClient {
  uuid:       string
  secret:     string
  image_id:   number
  socket_id?: string
  room_id?:   string
  draft_id?:  string
}

interface DraftRoom {
  image_id:     number
  preset:       Drafting.DraftRoomPreset
  participants: Array<{
    client: DraftClient
    ready:  boolean
  }>
}

type MsgHandlers = { [K in keyof Drafting.C_MsgDefs]: MsgHandler<K> }
type MsgHandler<K extends keyof Drafting.MsgDefs> = (ctx: MsgContext<K>) => Promise<Drafting.AckBodyOf<K>>
type MsgContext<K extends keyof Drafting.MsgDefs> = {
  data:    Drafting.MsgOf<K>
  socket:  Socket
  asserts: {
    session: () => DraftClient
    room:    () => {
      room_id: string
      room:    DraftRoom
      member:  DraftRoom['participants'][number]
      session: DraftClient
    }
  }
}

@WebSocketGateway({ cors: true })
export class DraftGateway implements OnGatewayDisconnect, OnGatewayConnection {
  constructor(readonly preset: PresetService) {
    this.online$.subscribe(o => this.logger.log(`BIND ${o.socket.id} -> ${o.uuid}`))
    this.offline$.subscribe(o => this.logger.log(`EXIT ${o.socket.id} -> ${o.uuid ?? '*'}`))
  }

  @WebSocketServer()
  server: Server

  logger   = new Logger('DraftGateway')
  clients  = new Map<string, DraftClient>()
  sessions = new Map<string, DraftingSession>()
  rooms    = new Map<string, DraftRoom>()

  online$  = new Subject<{ uuid: string; socket: Socket }>()
  offline$ = new Subject<{ uuid: string; socket: Socket }>()

  loading = this.preset.initialized

  picked$ = new Subject<{
    uuid: string
    data: Drafting.MsgOf<'c_pick_selection'>
  }>()

  _handlers: MsgHandlers = {
    c_bind: async ({ data, socket }) => {
      const reg  = this.register(data)
      const prev = reg.socket_id && this.server.sockets.sockets.get(reg.socket_id)

      if (prev && reg.socket_id !== socket.id) {
        this.logger.warn(`re-bind ${reg.uuid}, disconnect ${prev.id}`)
        prev.emit('M', Drafting.mkmsg('s_error', { code: 'REBIND', message: 'off you go' }))
        prev.disconnect()
      }

      this.online(socket, data)

      return { uuid: reg.uuid, image_id: reg.image_id }
    },

    c_poll_presets: async () => this.preset.list(),

    c_create_room: async ({ data, asserts }) => {
      asserts.session()

      const [preset]        = this.preset.list()
      const room_id         = randomBytes(12).toString('base64').replace(/\//g, '_')
      const room: DraftRoom = { participants: [], image_id: data.image_id, preset }

      this.rooms.set(room_id, room)

      return { participants: [], room_id, image_id: data.image_id }
    },

    c_join_room: async ({ data, asserts, socket }) => {
      const session = asserts.session()

      if (session.room_id) {
        throw new DSError('ROOM_CONFLICT')
      }

      if (session.draft_id && this.sessions.has(session.draft_id)) {
        throw new DSError('PICKING')
      }

      if (this.sessions.has(data.room_id)) {
        throw new DSError('PICKING')
      }

      const room = this.rooms.get(data.room_id)
      if (!room) { throw new DSError('NOT_FOUND', 'no such room') }

      const member = { client: session, ready: false }
      socket.session.room_id = data.room_id
      room.participants.push(member)

      this.server.to(data.room_id).emit('M', Drafting.mkmsg('s_participant_did_join_room', {
        uuid: session.uuid, image_id: session.image_id
      }))
      const roominfo = this._makeRoomInfo(data.room_id, room)
      this.server.to(data.room_id).emit('M', Drafting.mkmsg('s_room_info', roominfo))

      socket.join(data.room_id)

      return roominfo
    },

    c_leave_room: async ({ socket, asserts }) => {
      const { room_id, session } = asserts.room()
      this._leave(session, room_id, socket)
      return {}
    },

    c_poll_rooms: async ({ asserts }) => {
      asserts.session()
      return Array.from(this.rooms.entries())
        .map(([room_id, { image_id }]) => ({ room_id, image_id }))
    },

    c_use_preset: async ({ asserts, data }) => {
      const { room, room_id } = asserts.room()
      room.preset.id = data.id
      this.server.to(room_id).emit('M', Drafting.mkmsg('s_room_info', this._makeRoomInfo(room_id, room)))
      return {}
    },

    c_request_room_info: async ({ data }) => this._getRoomInfo(data.room_id),

    c_ready: async ({ data, asserts }) => {
      const { member, room_id, session, room } = asserts.room()
      member.ready = data.ready


      setImmediate(() => {
        this.server.to(room_id).emit('M', Drafting.mkmsg('s_participant_did_ready', {
          uuid: session.uuid, image_id: session.image_id, ready: member.ready
        }))

        const roominfo = this._makeRoomInfo(room_id, room)
        this.server.to(room_id).emit('M', Drafting.mkmsg('s_room_info', roominfo))
      })

      return { ready: member.ready }
    },

    c_pick_selection: async ({ data, asserts }) => {
      const { uuid } = asserts.session()
      this.picked$.next({ uuid, data })

      return {}
    },

    c_request_start_draft: async ({ asserts }) => {
      const { room_id, room } = asserts.room()

      if (this.sessions.has(room_id)) {
        throw new DSError('CONFLICT')
      }

      if (!room.participants.every(p => p.ready)) {
        throw new DSError('NOT_READY')
      }

      this.rooms.delete(room_id)
      for (const p of room.participants) {
        p.client.room_id  = undefined
        p.client.draft_id = room_id

        const socket = this.server.sockets.sockets.get(p.client.socket_id!)
        if (socket) {
          socket.leave(room_id)
          socket.emit('M', Drafting.mkmsg('s_room_expired', {}))
        }
      }

      const preset  = room.preset
      const schema  = this.preset.presets.get(preset.id)?.schema
      if (!schema) {
        throw new DSError('NOT_FOUND', `no preset ${preset.id}`)
      }

      const session = new DraftingSession(room_id, { ...preset, schema }, async (uuid, message) => {
        const reg = this.clients.get(uuid)
        if (!reg) { throw new DSError('BUG') }

        while (true) {
          let socket = this.server.sockets.sockets.get(reg.socket_id!)
          if (!socket) {
            session.logger.debug(`waiting for ${uuid} to be online..., TTL ${RECONNECT_TIMEOUT}`)
            const reconnect = firstValueFrom(this.online$.pipe(filter(o => o.uuid === uuid), map(o => o.socket)))
            socket = await withTimeout(RECONNECT_TIMEOUT, reconnect)

            if (!socket) { throw new DSError('TIMEDOUT') }

            // reconnected, send recover-info
            const picks = flatten(Object.values(session.participants.find(p => p.uuid === uuid)?.selections ?? {}))
            socket.emit('M', Drafting.mkmsg('s_draft_recover', { draft_id: room_id, picks, participants: session.participants }))
          }

          const response = await Promise.race([
            Promise.all([
              new Promise<Drafting.Ack>(resolve => socket!.emit('M', message, resolve)),

              message.tag === 's_pick_request' && firstValueFrom(
                this.picked$.pipe(
                  filter(o => o.uuid === uuid && o.data.draft_id === message.draft_id && o.data.req_id === message.req_id),
                  map(o => o.data))) // 丑, 但是能用
            ]).then(([response, data]) => data ? { status: 'ok', data } : response),
            firstValueFrom(this.offline$.pipe(filter(o => o.uuid === uuid))).then(() => undefined)
          ])

          if (!response) {
            const alloffline = session.participants.every(p => {
              const id = this.clients.get(p.uuid)?.socket_id
              return !id || (this.server.sockets.sockets.get(id)?.connected ?? false)
            })

            if (alloffline) { throw new DSError('ALL_OFFLINE') }

            continue
          }

          if (response.status !== 'ok') {
            session.logger.debug(`got response: ` + JSON.stringify(response))
            socket.emit('M', Drafting.mkmsg('s_error', { code: 'HOW-DARE-YOU', message: '!' }))
            continue
          }

          return response.data
        }
      })

      session.participants = room.participants.map(p => ({
        uuid: p.client.uuid, image_id: p.client.image_id, selections: {}
      }))

      this.sessions.set(room_id, session)

      session.start()
        .catch(e => this.logger.error(e))
        .finally(() => {
          this.logger.log(`session ${room_id} complete`)
          this.sessions.delete(room_id)
          for (const p of room.participants) {
            p.client.draft_id = undefined
          }
        })

      return {}
    }
  }

  @SubscribeMessage('M')
  async handleMessage(
    @MessageBody()     data:   Drafting.C_Msg,
    @ConnectedSocket() socket: Socket
  ) {
    try {
      await this.loading
      const asserts = {
        session: () => this._assertSession(socket),
        room:    () => this._assertRoom(socket)
      }
      const ctx  = { data, socket, asserts }
      const body = await this._handlers[data.tag](ctx as any)
      return Drafting.okack(data.tag, body)
    } catch (e) {
      this.logger.error(e)
      this.logger.error(e.stack)
      return Drafting.errack(data.tag, e.code ?? 'SERVER_ERROR', e.message)
    }
  }

  handleConnection(client: Socket) {
    this.logger.debug(`> handleConnect ${client.id}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`> handleDisconnect ${client.id}`)
    this.offline(client)
  }

  register(p: Drafting.ParticipantInfo & { secret: string }) {
    const reg = this.clients.get(p.uuid)
    if (reg) {
      if (reg.secret === p.secret) {
        return reg
      }
      throw new DSError('FORBIDDEN')
    }

    const info = {
      uuid:      p.uuid,
      secret:    p.secret,
      image_id:  p.image_id,
      socket_id: undefined,
      room_id:   undefined
    }
    this.clients.set(info.uuid, info)

    return info
  }

  online(socket: Socket, bind: Omit<Drafting.MsgOf<'c_bind'>, 'tag'>) {
    const session = this.clients.get(bind.uuid)
    if (!session) { return }

    session.image_id  = bind.image_id
    session.socket_id = socket.id
    socket.session    = session

    this.online$.next({ uuid: bind.uuid, socket })

    return session
  }

  offline(socket: Socket) {
    if (socket.session?.uuid) {
      this.offline$.next({ uuid: socket.session.uuid, socket })
      if (socket.session.room_id) {
        this._leave(socket.session, socket.session.room_id, socket)
      }
    }
  }

  _leave(client: DraftClient, room_id: string, socket: Socket) {
    const room = this.rooms.get(room_id)
    if (!room) { throw new DSError('NOT_FOUND') }

    const idx = room.participants.findIndex(p => p.client.uuid === client.uuid)
    if (idx === -1) { throw new DSError(`NOT_IN_ROOM`) }

    room.participants.splice(idx, 1)
    client.room_id = undefined
    socket.leave(room_id)

    setImmediate(() => {
      this.server.to(room_id).emit('M', Drafting.mkmsg('s_participant_did_leave_room', {
        uuid: client.uuid, image_id: client.image_id
      }))

      this.server.to(room_id).emit('M', Drafting.mkmsg('s_room_info', this._makeRoomInfo(room_id, room)))
    })
  }

  _makeRoomInfo(room_id: string, room: DraftRoom) {
    return {
      room_id:      room_id,
      image_id:     room.image_id,
      preset:       room.preset,
      participants: room.participants.map(
        p => ({ uuid: p.client.uuid, image_id: p.client.image_id, ready: p.ready })
      )
    }
  }

  _getRoomInfo(room_id: string) {
    const room = this.rooms.get(room_id)
    if (!room) { throw new DSError('NOT_FOUND') }

    return this._makeRoomInfo(room_id, room)
  }

  _assertRoom(socket: Socket) {
    const session = this._assertSession(socket)
    const room_id = session.room_id!
    const room    = this.rooms.get(room_id)
    if (!room || !room_id) { throw new DSError('NOT_IN_ROOM') }

    const member = room.participants.find(p => p.client.uuid === socket.session.uuid)
    if (!member) { throw new DSError('BUG') }

    return { room_id, room, member, session }
  }

  _assertSession(socket: Socket) {
    const session = socket.session
    if (!session) {
      this.logger.warn(`Unbound ${socket.id}`)
      throw new DSError('UNBOUND', `c_bind required`)
    }

    return session
  }
}
