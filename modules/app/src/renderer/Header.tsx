import classnames from 'classnames'
import { useContext } from 'react'
import useLocalStorage from 'use-local-storage'
import { CimgClip } from './CimgClip'
import { AppContext } from './context'
import style from './Header.scss'
import { Keys, useCardInfo } from './misc'
import { Flex, FullH, FullW } from './style-common'

export function Header(props: {
  leftpane?:   JSX.Element
  allowreroll: boolean
}) {
  const [uuid]   = useLocalStorage(Keys.UUID, '')
  const [secret] = useLocalStorage(Keys.SECRET, '')
  const ctx      = useContext(AppContext)
  const info     = useCardInfo(ctx.session.bound?.image_id)

  return <header className={classnames(style.container, FullW, Flex)}>
    {props.leftpane ?? <div></div>}
    <div className={classnames(style.rightpane, FullH, Flex)}>
      {
        ctx.session.bound && <>
          {
            ctx.session.bound?.image_id ? <>
              <CimgClip code={ctx.session.bound.image_id} />
              <span>{info?.name ?? '<loading>'}</span>
              <span>|</span>
            </> : <>无头像, 点右侧随机 →</>
          }
          {
            props.allowreroll && <>
              <span>
                <a
                  onClick={
                    async () => {
                      const ci = await window.ipc.randomAvatarCard({
                        includes: ['MONSTER'],
                        excludes: ['TOKEN', 'PENDULUM', 'LINK']
                      })
                      if (ci) {
                        const resp = await ctx.request('c_bind', { uuid, secret, image_id: ci.code })
                        ctx.update.bound(resp)
                        localStorage.setItem(Keys.AVATAR, ci.code.toString())
                      }
                    }
                  }
                >
                  [reroll]
                </a>
              </span>
              <span>|</span>
            </>
          }
        </>
      }
      <span>{ ctx.session.online ? '已连接到服务器' : '未连接' }</span>
    </div>
  </header>
}
