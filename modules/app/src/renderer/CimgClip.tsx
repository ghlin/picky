import { YGOPROCardInfo } from '@picky/shared'
import { HTMLAttributes } from 'react'
import usePromise from 'react-use-promise'
import style from './CimgClip.scss'

export function CimgFull(props: HTMLAttributes<HTMLDivElement> & {
  code: number
}) {
  const { code, ...divprops } = props
  return <div className={style.cimgfull + ' cimgfull'} {...divprops}>
    <img src={'cimg://' + code} />
  </div>
}

export function CimgClip(props: HTMLAttributes<HTMLDivElement> & {
  code: number
}) {
  const { code, ...divprops } = props
  return <div className={style.cimgclip + ' cimgclip'} {...divprops}>
    <img src={'cimg://' + code} />
  </div>
}

export function CimgClipButton(props: HTMLAttributes<HTMLDivElement> & {
  code:        number
  info?:       YGOPROCardInfo,
  renderTitle: (info?: YGOPROCardInfo) => JSX.Element
  renderLabel: (info?: YGOPROCardInfo) => JSX.Element
}) {
  const { code, info, renderTitle, renderLabel, ...divprops } = props
  const [ci] = usePromise(async () => {
    return info ?? window.ipc.queryCardInfo(code)
  }, [code])

  return <div className={style.cimgclipbtn + ' cimgclipbtn'} {...divprops}>
    <CimgClip code={props.code} />
    <div className={style.cimgclipbtnlbl}>
      <div>{renderTitle(ci)}</div>
      <div>{renderLabel(ci)}</div>
    </div>
  </div>
}
