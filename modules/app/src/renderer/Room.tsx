import { defined, Drafting } from '@picky/shared'
import classnames from 'classnames'
import { useContext } from 'react'
import usePromise from 'react-use-promise'
import { CimgClip, CimgClipButton } from './CimgClip'
import { AppContext } from './context'
import { Header } from './Header'
import { useCardInfo } from './misc'
import style from './Room.scss'
import { Flex, FlexV, Full, FullH, UI } from './style-common'

export function Room() {
  const ctx   = useContext(AppContext)
  const room  = ctx.session.room!
  const info  = useCardInfo(room?.image_id)

  const self  = room?.participants.find(p => p.uuid === ctx.session.bound?.uuid)
  const ready = self?.ready

  const [presets] = usePromise(
    ctx.request('c_poll_presets', {}).catch(ctx.handle) as Promise<Drafting.DraftRoomPreset[]>,
    [room.room_id])

  return <div className={classnames(style.container, Full, FlexV)}>
    <Header
      allowreroll={false}
      leftpane={
        <div className={classnames(Flex, style.header)}>
          <CimgClip code={room?.image_id} />
          <span>房间: {info?.name ?? '<loading>'}</span>
          <span>|</span>
          <span>
            <a
              onClick={
                async () => {
                  try {
                    await ctx.request('c_leave_room', {})
                  } catch (e: any) {
                    ctx.handle(e)
                  } finally {
                    ctx.update.room(undefined)
                  }
                }
              }
            >
              [离开]
            </a>
          </span>
        </div>
      }
    />

    <div className={classnames(Full, Flex)}>
      <div className={classnames(style.presets, FullH, FlexV)}>
        {
          presets?.map(preset => <div
            key={preset.id}
            className={classnames(FlexV, style.preset, { [style.active]: preset.id === room?.preset.id })}
            onClick={() => ctx.request('c_use_preset', { id: preset.id }).catch(ctx.handle)}
          >
            <h3>{preset.name}</h3>
            <p>{preset.description}</p>
          </div>)
        }
      </div>

      <div className={classnames(style.players, FullH, FlexV)}>
        {
          room?.participants.map(p => <CimgClipButton
            key={p.uuid}
            code={p.image_id}
            renderTitle={info => <span>{info?.name ?? '...loading...'}</span>}
            renderLabel={() => <span>{p.ready ? '已准备好' : '! 未准备好'}</span>}
          />)
        }
        <button
          disabled={!defined(ready)}
          className={UI}
          onClick={() => ctx.request('c_ready', { ready: !ready }).catch(ctx.handle)}>
          {ready ? '稍等' : '准备'}
        </button>

        <button
          disabled={!room || room?.participants.some(p => !p.ready)}
          className={UI}
          onClick={() => ctx.request('c_request_start_draft', {}).catch(ctx.handle)}>
          开始
        </button>
      </div>
    </div>
  </div>
}
