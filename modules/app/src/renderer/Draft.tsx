import { atoi10, CTypeEnums, defined, Drafting, YGOPROCardInfo } from '@picky/shared'
import classnames from 'classnames'
import { HTMLAttributes, useContext, useEffect, useState } from 'react'
import ReactModal from 'react-modal'
import ReactTooltip from 'react-tooltip'
import usePromise from 'react-use-promise'
import { CimgClipButton } from './CimgClip'
import { AppContext } from './context'
import { DeckView } from './Decks'
import style from './Draft.scss'
import { Flex, FlexV, Full, FullH, FullW, UI } from './style-common'

type DraftingState = AppContext['drafting'] extends (undefined | infer P) ? P : never

function Pickreq({ drafting, pickreq, selection, expand, ...divprops }: {
  drafting:  DraftingState
  pickreq:   Drafting.PickRequest
  selection: DraftingState['selections'][string]
  expand:    (code: number | undefined) => void
} & HTMLAttributes<HTMLDivElement>) {
  const ctx                  = useContext(AppContext)
  const [picks, updatePicks] = useState<string[]>([])
  const [packid]             = pickreq.req_id.split(':')[0]
  const prefix               = `第${packid}包${pickreq.ptype === 'draft' ? ` 第${pickreq.meta.shift.index + 1}轮 (共${pickreq.meta.shift.total}轮)` : ''}`
  const min                  = pickreq.ptype === 'draft' ? pickreq.npicks : pickreq.npicks.min
  const max                  = pickreq.ptype === 'draft' ? pickreq.npicks : pickreq.npicks.max
  const constraint           = min === max ? min : [min, max].join('~')
  const hint                 = `已选${picks.length}件, 应选${constraint}件`

  useEffect(() => ctx.update.prepick(pickreq.req_id, pickreq.candidates.filter(c => picks.includes(c.id))), [picks.length, picks])
  useEffect(() => { ReactTooltip.rebuild() }, [])

  const progress = drafting.progress[pickreq.req_id] ?? []
  const picking  = progress.filter(p => !p.done && p.uuid !== ctx.session?.bound?.uuid)

  const [slowpickers] = usePromise(() => Promise.all(picking.map(p => window.ipc.queryCardInfo(p.image_id))), [picking.length])

  if (selection?.state === 'confirmed') {
    if (picking.length === 0) { return <></> }
    return <div {...divprops} className={classnames(style.section, style.picking, FlexV, FullW)}>
      <div className={classnames(Flex, FullW)}>
        <span>{prefix}</span>
        <span className={classnames(style.slowpickers, Flex)}>
          等待{ (slowpickers ?? []).map(whom => whom?.name ?? 'loading').map(s => '[' + s + ']').join(', ')}选择...
        </span>
        <span />
      </div>
    </div>
  }

  const over = picks.length > max
  const lack = picks.length < min
  const fine = !over && !lack
  const toggle = (id: string) => updatePicks(ps => ps.includes(id) ? ps.filter(p => p !== id) : ps.concat([id]))

  const center = selection?.state === 'pending' ? <button disabled>提交中</button> : <button
    className={UI}
    disabled={!fine}
    onClick={() => ctx.update.select(drafting.id, pickreq.req_id, pickreq.candidates.filter(c => picks.includes(c.id)))}
  >
    确认选择
  </button>

  const pile = <div className={classnames(style.pile, FullW, Flex, fine ? style.fine : lack ? style.lack : style.over)} >
    {
      pickreq.candidates.map(c => {
        const highlight = picks.includes(c.id)
        return <div
          key={c.id}
          className={classnames(Flex, style.candidate, highlight ? style.highlight : style.normal)}
          onClick={() => !selection && toggle(c.id)}
        >
          {
            c.pack.map((code, i) => <div key={c.id + '/' + i} className={style.cimg} data-tip={c.id} data-for='info-tooltip'>
              <img src={'cimg://' + code} />
              <div className={classnames(style.togglebtnwrapper, Flex)}>
                <div
                  className={style.togglebtn}
                  onClick={
                    e => {
                      expand(code)
                      e.stopPropagation()
                    }
                  }
                >
                  ?
                </div>
              </div>
            </div>)
          }
        </div>
      })
    }
  </div>

  return <div {...divprops} className={classnames(style.section, style.picking, FlexV, FullW)}>
    <div className={classnames(Flex, FullW)}><span>{prefix} / {hint}</span>{center}<span /></div>
    {pile}
  </div>
}

function PreviewItemLabel({ info }: { info: YGOPROCardInfo }) {
  if (info.types.includes('MONSTER')) {
    const islink = info.types.includes('LINK')
    const ispend = info.types.includes('PENDULUM')
    const isxyz  = info.types.includes('XYZ')
    const aster  = isxyz ? 'Rank' : islink ? 'Link' : 'Lvl'
    return <div className={classnames(style.previewitemlabel, style.previewitemmonster)}>
      <span>{aster}-{info.mlevel}</span>
      {ispend && <span>S.{info.mscale}</span>}
      <span>ATK:{info.matk}</span>
      {islink ? <span>-</span> : <span>DEF:{info.mdef}</span>}
    </div>
  } else {
    return <div className={classnames(style.previewitemlabel, style.previewitemspell)}>
      {info.types.map(t => <span key={t}>{t}</span>)}
    </div>
  }
}

function DeckPreviewItem({ info, ...divprops }: HTMLAttributes<HTMLDivElement> & { info: YGOPROCardInfo }) {
  return <div {...divprops} className={classnames(style.previewitem, ...(info?.types ?? []))}>
    <CimgClipButton
      code={info.code}
      label={info ? <PreviewItemLabel info={info} /> : <></>}
    />
  </div>
}

function isExtra(tags: CTypeEnums[]) {
  return tags.some(t => ['LINK', 'XYZ', 'LINK', 'SYNCHRO', 'FUSION'].includes(t))
}

export function Draft() {
  const ctx                 = useContext(AppContext)
  const drafting            = ctx.drafting!
  const [expand, setExpand] = useState<number>()
  const [order, setOrder]   = useState<'none' | 'mlevel' | 'matk' | 'mdef' | 'mtype' | 'mattribute'>('none')
  const unstables           = Object.values(drafting.unstables).flatMap(s => s)
  const deck                = drafting.stables.concat(unstables)
  const [info] = usePromise(async () => expand && window.ipc.queryCardInfo(expand), [expand])
  const previewitems = order === 'none' ? deck : deck.sort((a, b) => {
    const exa = isExtra(a.types)
    const exb = isExtra(b.types)
    if (exa !== exb) { return exa ? -1 : 1 }

    const mona = a.types.includes('MONSTER')
    const monb = b.types.includes('MONSTER')

    return mona === monb ? -(a[order] === b[order] ? a.code - b.code : a[order] - b[order]) : mona ? -1 : 1
  })

  const stats = {
    extra:    previewitems.filter(i => isExtra(i.types)),
    monsters: previewitems.filter(i => i.types.includes('MONSTER') && !isExtra(i.types)),
    spells:   previewitems.filter(i => i.types.includes('SPELL')),
    traps:    previewitems.filter(i => i.types.includes('TRAP')),
  }

  return <div className={classnames(style.container, Full)}>
    <ReactModal
      isOpen={defined(expand)}
      className={style.modal}
      overlayClassName={style.overlay}
      shouldCloseOnEsc
      shouldFocusAfterRender
      shouldCloseOnOverlayClick
      onRequestClose={() => setExpand(undefined)}
    >
      <div className={classnames(Flex)}>
        <div className={classnames(style.imgpane)}>
          <img src={'cimg://' + expand!} />
        </div>
        <div className={classnames(FlexV, style.infopane)}>
          {
            info && <>
              <div>
                <span>{info.name}</span>
                <span>
                  {info.types.includes('MONSTER') && info.mlevel}
                </span>
              </div>
              {
                info.types.includes('MONSTER') && <div>
                  <span>ATK: {info.matk}</span>
                  {!info.types.includes('LINK') && <span>DEF: {info.mdef}</span>}
                  {info.types.includes('PENDULUM') && <span>SCALE: {info.mscale}</span>}
                </div>
              }
              <div><span>{info.types.join(' / ')}</span></div>
              <div>
                <div>{ info.desc.split('\r\n').map((seg, i) => <p key={i}>{seg}</p>)}</div>
              </div>
            </>
          }
        </div>
      </div>
    </ReactModal>

    {
      !drafting.complete && <div className={classnames(style.deckpreview, FlexV, FullH)}>
        <div className={FlexV}>
          <div className={style.previewstats}>
            <div><span>Ex</span><span>{stats.extra.length}</span></div>
            <div><span>Monsters</span><span>{stats.monsters.length}</span></div>
            <div><span>Spells</span><span>{stats.spells.length}</span></div>
            <div><span>Traps</span><span>{stats.traps.length}</span></div>
          </div>
          <div className={classnames(style.previewctls, FullW, Flex)}>
            <div className={classnames(style.ctrl, Flex, FullW)}>
              <label htmlFor="order">排序</label>
              <select id="order" name="order" onChange={e => setOrder(e.target.value as any)} value={order} className={UI}>
                {
                  (
                    [
                      ['none',       '无'],
                      ['mattribute', '属性'],
                      ['mtype',      '种族'],
                      ['mlevel',     '等级'],
                      ['matk',       '攻击力'],
                      ['mdef',       '守备力'],
                    ] as const
                  ).map(([ord, label]) => <option key={ord} value={ord}>{label}</option>)
                }
              </select>
            </div>
          </div>
        </div>
        {
          previewitems.map((info, i) => <DeckPreviewItem
            info={info}
            key={i}
            onClick={() => setExpand(info.code)}
          />)
        }
      </div>
    }

    {
      Object.keys(drafting.pickreqs)
        .sort((a, b) => atoi10(a.split(':')[0])! - atoi10(b.split(':')[0])!)
        .map(key => <Pickreq
            key={key}
            drafting={drafting}
            pickreq={drafting.pickreqs[key]}
            selection={drafting.selections[key]}
            expand={code => setExpand(code)}
          />)
    }

    {
      drafting.complete && <>
        <div className={classnames(style.deckview, FullW, Flex)}>
          <DeckView
            deck={{ draft_id: drafting.id, list: drafting.stables.map(s => s.code) }}
          />
        </div>
        <div className={classnames(style.backnav, FullW, Flex)}>
          <button
            onClick={() => ctx.update.cleardraft()}
            className={UI}
          >
            返回
          </button>
        </div>
      </>
    }

    <ReactTooltip
      id='info-tooltip'
      getContent={
        data => {
          const code = atoi10(data)
          if (!code) { return '<loading>' }
          const info = ctx.dbcache[code]
          if (!info) { return '<loading>' }

          return renderTooltip(info)
        }
      }
    />
  </div>
}

function renderTooltip(info: YGOPROCardInfo) {
  return <div className={classnames(FlexV, style.tooltip)}>
    {
      info && <>
        <div>
          <span>{info.name}</span>
          <span>
            {info.types.includes('MONSTER') && info.mlevel}
          </span>
        </div>
        {
          info.types.includes('MONSTER') && <div>
            <span>ATK: {info.matk}</span>
            {!info.types.includes('LINK') && <span>DEF: {info.mdef}</span>}
            {info.types.includes('PENDULUM') && <span>SCALE: {info.mscale}</span>}
          </div>
        }
        <div><span>{info.types.join(' / ')}</span></div>
        <div>
          <div>{ info.desc.split('\r\n').map((seg, i) => <p key={i}>{seg}</p>)}</div>
        </div>
      </>
    }
  </div>
}
