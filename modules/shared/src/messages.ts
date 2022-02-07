export interface C_MsgDefs {
  c_bind:                       ParticipantInfo & { secret: string }
  c_create_room:                { image_id: number }
  c_join_room:                  { room_id: string }
  c_ready:                      { ready: boolean }
  c_leave_room:                 { }
  c_poll_rooms:                 { }
  c_request_room_info:          { room_id: string }
  c_use_preset:                 { id: string }
  c_poll_presets:               { }
  c_request_start_draft:        { }
  c_pick_selection:             { draft_id: string; req_id: string; picks: string[] }
}

export interface S_MsgDefs {
  s_room_info:                  RoomInfo
  s_room_expired:               {}
  s_participant_did_join_room:  ParticipantInfo
  s_participant_did_ready:      ParticipantInfo & { ready: boolean }
  s_participant_did_leave_room: ParticipantInfo
  s_draft_did_start:            { draft_id: string; preset: DraftRoomPreset; participants: ParticipantInfo[] }
  s_participant_did_pick:       { draft_id: string; req_id: string; who: string }
  s_draft_complete:             { draft_id: string; picks: PickCandidate[] }
  s_draft_did_stop:             { draft_id: string }
  s_pick_progress:              PickProgress
  s_pick_request:               PickRequest
  s_pick_complete:              { draft_id: string; req_id: string }
  s_draft_recover:              { draft_id: string; picks: PickCandidate[]; participants: ParticipantInfo[] }
  s_error:                      { code: string; message: string }
}

export type MsgDefs = C_MsgDefs & S_MsgDefs

export interface AckDefs {
  c_bind:              { uuid: string; image_id: number; room?: BaseRoomInfo; draft_id?: string }
  c_create_room:       BaseRoomInfo
  c_join_room:         RoomInfo
  c_ready:             { ready: boolean }
  c_request_room_info: RoomInfo
  c_poll_rooms:        BaseRoomInfo[]
  c_pool_presets:      DraftRoomPreset[]
}

export interface BaseRoomInfo {
  room_id:      string
  image_id:     number
}

export interface RoomInfo extends BaseRoomInfo {
  preset:       DraftRoomPreset
  participants: (ParticipantInfo & { ready: boolean })[]
}

export interface DraftRoomPreset {
  id:          string
  name:        string
  description: string
}

export interface ParticipantInfo {
  uuid:     string
  image_id: number
}

export type PickID = string

export interface PickCandidate {
  id:    PickID
  meta?: { tier: number }
  pack:  number[]
}

export interface DraftPickCandidates {
  meta: {
    title?: string
    shift:  {
      index: number
      total: number
      prev?: string
      next?: string
    }
  }

  candidates: PickCandidate[]
  npicks:     number
}

export interface SealedPickCandidates {
  meta:       { title?: string }

  candidates: PickCandidate[]
  npicks:     { min: number; max: number }
}

export type PickRequest = { draft_id: string; req_id: string } & (
    ({ ptype: 'draft'  } & DraftPickCandidates)
  | ({ ptype: 'sealed' } & SealedPickCandidates)
  )

export interface PickSelection { picks: PickID[] }

export interface PickProgress {
  draft_id:     string
  req_id:       string
  participants: Array<{ uuid: string; image_id: number; done: boolean }>
}

type DistributeMsgHelper<U>     = U extends keyof MsgDefs ? MsgOf<U>     : never
type DistributeAckHelper<U>     = U extends keyof MsgDefs ? AckOf<U>     : never
type DistributeAckBodyHelper<U> = U extends keyof MsgDefs ? AckBodyOf<U> : never

export type C_Msg   = DistributeMsgHelper<keyof C_MsgDefs>
export type S_Msg   = DistributeMsgHelper<keyof S_MsgDefs>
export type Msg     = DistributeMsgHelper<keyof MsgDefs>
export type Ack     = DistributeAckHelper<keyof MsgDefs>
export type AckBody = DistributeAckBodyHelper<keyof MsgDefs>

export type MsgOf<K extends keyof MsgDefs>     = { tag: K } & MsgDefs[K]
export type AckBodyOf<K extends keyof MsgDefs> = K extends keyof AckDefs ? AckDefs[K] : {}
export type AckOf<K extends keyof MsgDefs>
  = {
    status:  'error'
    tag:     K
    code:    string
    message: string
  } | {
    status:  'ok'
    tag:     K
    data:    AckBodyOf<K>
  }

export function mkmsg<K extends keyof MsgDefs>(tag: K, body: Omit<MsgOf<K>, 'tag'>) {
  return { tag, ...body } as MsgOf<K>
}

export function okack<K extends keyof MsgDefs>(tag: K, data: AckBodyOf<K>) {
  return { status: 'ok' as const, tag, data }
}

export function errack<K extends keyof MsgDefs>(tag: K, code: string, message: string) {
  return { status: 'error' as const, tag, code, message }
}
