import classnames from 'classnames'
import { Link } from 'react-router-dom'
import style from './Settings.scss'
import { Debug, Flex, FlexH, FlexV, Full, FullW, UI } from './style-common'

export function Settings() {
  return <div className={classnames(style.container, Full, Debug, FlexV)}>
    <div className={classnames(style.section, FullW, Flex)}>
      <span>更改YGOPRO目录</span>
      <div className={classnames(Full, FlexH)}>
        <button className={UI} onClick={() => window.ipc.promptYGOPROPathSelect()}>选择目录</button>
        <div><p>(只在YGOPRO被移动过时才需要更新目录)</p></div>
      </div>
    </div>

    <div className={classnames(style.section, style.complete, Full, Flex)}>
      <Link to='/'><button className={UI}>完成</button></Link>
    </div>
  </div>
}
