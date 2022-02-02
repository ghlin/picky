import { useState } from 'react'
import { CimgFull } from './CimgClip'
import { DeckInfo } from './context'
import style from './Decks.scss'
import { classnames } from './misc'
import { Flex, FlexV, Full, FullW, UI } from './style-common'

export function DeckView(props: {
  deck: DeckInfo
}) {
  const [duelServer, setDuelServer] = useState('s2.ygo233.com:233')
  const [passcode,   setPasscode]   = useState('')

  const singlepass = `NF,NC,M#${props.deck.draft_id}`
  const tagpass    = `NF,NC,T#${props.deck.draft_id}`

  return <div className={classnames(style.deckview, Full, FlexV)}>
    <div className={classnames(style.cardlist, Flex, FullW)}>
      {
        props.deck.list.map((code, i) => <CimgFull code={code} key={i} />)
      }
    </div>

    <div className={classnames(style.ctrls, Flex, FullW)}>
      <input
        type='text'
        className={UI}
        value={duelServer}
        onChange={e => setDuelServer(e.target.value)}
        spellCheck={false}
      />

      <input
        type='text'
        className={UI}
        value={passcode}
        readOnly
        spellCheck={false}
        onClick={
          () => window.ipc.writeClipboard(passcode)
        }
      />

      <button
        className={UI}
        onMouseOver={() => setPasscode(singlepass)}
        onClick={
          () => window.ipc.startYGOPRO({
            draft_id: props.deck.draft_id,
            server:   duelServer,
            passcode: singlepass,
            deck:     props.deck.list
          })
        }
      >
        Duel! (1v1 match)
      </button>

      <button
        className={UI}
        onMouseOver={() => setPasscode(tagpass)}
        onClick={
          () => window.ipc.startYGOPRO({
            draft_id: props.deck.draft_id,
            server:   duelServer,
            passcode: tagpass,
            deck:     props.deck.list
          })
        }
      >
        Duel! (2v2 tag duel)
      </button>
    </div>
  </div>
}
