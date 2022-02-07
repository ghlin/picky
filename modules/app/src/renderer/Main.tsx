import classnames from 'classnames'
import { useContext } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { CimgClipButton } from './CimgClip'
import { AppContext, hasCode } from './context'
import { Draft } from './Draft'
import { Header } from './Header'
import style from './Main.scss'
import { Room } from './Room'
import { Debug, Flex, FlexV, Full, FullH, FullW, UI } from './style-common'

export function MainPage() {
  const ctx = useContext(AppContext)

  const create  = async () => {
    const ran         = await window.ipc.randomAvatarCard({ includes: ['FIELD', 'SPELL'] })
    const { room_id } = await ctx.request('c_create_room', { image_id: ran.code })
    const room        = await ctx.request('c_join_room', { room_id })
    ctx.update.refresh()
    ctx.update.room(room)
  }

  if (ctx.drafting)     { return <Draft /> }
  if (ctx.session.room) { return <Room  /> }

  return <div className={classnames(style.container, Full, FlexV, Debug)}>
    <Header allowreroll />

    <div className={classnames(Full, Flex, Debug)}>
      <div className={classnames(Full, FlexV, Debug, style.rooms)}>
        {
          ctx.rooms.map(r => <CimgClipButton
            key={r.room_id}
            code={r.image_id}
            onClick={
              async () => {
                try {
                  await ctx.request('c_join_room', { room_id: r.room_id }).then(ctx.update.room)
                } catch (e: any) {
                  if (hasCode(e)) {
                    toast.error(`轮抽已经开始!`)
                    ctx.update.refresh()
                  } else {
                    ctx.handle(e)
                  }
                }
              }
            }
            label={<span>Join</span>}
          />)
        }
      </div>

      <div className={classnames(FullH, FlexV, Debug, style.navs)}>
        <div className={FullW}>
          <button
            disabled={!ctx.session.bound}
            onClick={() => create().catch(ctx.handle)}
            className={classnames(UI, FullW)}>
            创建房间
          </button>
        </div>
        <div className={FullW}>
          <button
            disabled={!ctx.session.bound}
            onClick={ctx.update.refresh}
            className={classnames(UI, FullW)}>
            刷新房间
          </button>
        </div>
        <div className={FullW}>
          <Link to='/settings'>
            <button
              className={classnames(UI, FullW)}
            >
              设置
            </button>
          </Link>
        </div>
      </div>
    </div>
  </div>
}
