import { atoi10, CTypeEnums, defined, Drafting, MATTRIBUTE_BY_CODE, MTYPES_BY_CODE, PRETTY_CTYPES, PRETTY_MTYPES, YGOPROCardInfo } from '@picky/shared'
import classnames from 'classnames'
import { HTMLAttributes, useContext, useEffect, useState } from 'react'
import ReactModal from 'react-modal'
import ReactTooltip from 'react-tooltip'
import usePromise from 'react-use-promise'
import { CimgClipButton } from './CimgClip'
import { AppContext } from './context'
import { DeckView } from './Decks'
import style from './Draft.scss'
import { ATTR_TEXTURES } from './misc'
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
  const [packid]             = pickreq.req_id.split(':')
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
  const slownames = (slowpickers ?? []).map(whom => whom?.name ?? 'loading').map(s => '[' + s + ']').join(', ')

  if (selection?.state === 'confirmed') {
    if (picking.length === 0) { return <></> }
    return <div {...divprops} className={classnames(style.section, style.picking, FlexV, FullW)}>
      <div className={classnames(Flex, FullW)}>
        <span>{prefix}</span>
        <span className={classnames(style.slowpickers, Flex)}>等待{slownames}选择...</span>
        <span />
      </div>
    </div>
  }

  const over = picks.length > max
  const lack = picks.length < min
  const fine = !over && !lack
  const toggle = (id: string) => {
    if (max === 1) {
      updatePicks(ps => ps
        .filter(p => pickreq.candidates.every(c => c.id !== p))
        .concat([id])
      )
    } else {
      updatePicks(ps => ps.includes(id) ? ps.filter(p => p !== id) : ps.concat([id]))
    }
  }

  const confirming = selection?.state === 'pending' ? <button disabled>提交中</button> : <button
    className={UI}
    disabled={!fine}
    onClick={() => ctx.update.select(drafting.id, pickreq.req_id, pickreq.candidates.filter(c => picks.includes(c.id)))}
  >
    确认选择
  </button>
  const hinting = picking.length === 0 ? '对手已确认' : `选择中: ${slownames}`
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
            c.pack.map((code, i) => <div key={c.id + '/' + i} className={style.cimg} data-tip={code + ':' + (c.meta?.desc ?? '')} data-for='info-tooltip'>
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
    <div className={classnames(Flex, FullW)}><span>{prefix} / {hint}, {hinting}</span>{confirming}<span /></div>
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
      <span>ATK:{normalizeADValue(info.matk)}</span>
      {islink ? <span>-</span> : <span>DEF:{normalizeADValue(info.mdef)}</span>}
    </div>
  } else {
    return <div className={classnames(style.previewitemlabel, style.previewitemspell)}>
      {info.types.map(t => <span key={t}>{t}</span>)}
    </div>
  }
}

function PreviewItemTitle({ info }: { info: YGOPROCardInfo }) {
  const attrname = MATTRIBUTE_BY_CODE[info.mattribute]
  const attrimg  = ATTR_TEXTURES[attrname]

  return <div className={style.previewitemlabel}>
    <span>{info.name}</span>
    {attrimg && <span><img src={attrimg} className={style.attr} /></span>}
  </div>
}

function DeckPreviewItem({ info, ...divprops }: HTMLAttributes<HTMLDivElement> & { info: YGOPROCardInfo }) {
  useEffect(() => { ReactTooltip.rebuild() }, [])
  return <div {...divprops} className={classnames(style.previewitem, ...(info?.types ?? []))}>
    <CimgClipButton
      code={info.code}
      renderLabel={info => info ? <PreviewItemLabel info={info} /> : <div />}
      renderTitle={info => info ? <PreviewItemTitle info={info} /> : <span>loading...</span>}
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
                info.types.includes('MONSTER') && <>
                  <div>
                    <span>{MTYPES_BY_CODE[info.mtype]}</span>
                    <span><img src={ATTR_TEXTURES[MATTRIBUTE_BY_CODE[info.mattribute]]} className={style.attr} /></span>
                  </div>
                  <div>
                    <span>ATK: {normalizeADValue(info.matk)}</span>
                    {!info.types.includes('LINK') && <span>DEF: {normalizeADValue(info.mdef)}</span>}
                    {info.types.includes('PENDULUM') && <span>SCALE: {info.mscale}</span>}
                  </div>
                </>
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
            data-tip={info.code}
            data-for='info-tooltip'
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
      className={style.tooltipcontainer}
      border
      id='info-tooltip'
      place='right'
      getContent={
        data => {
          if (!data) { return <></> }

          const colon = data.indexOf(':')
          const code = atoi10(data.slice(0, colon === -1 ? undefined : colon))

          if (!code) { return 'ill code: ' + data }

          const info = ctx.dbcache[code]
          if (!info) { return '<loading>' }

          const extra = colon === -1 ? [] : data.slice(colon + 1).split('\n').map(s => s.trim()).filter(s => s)
          return renderTooltip(info, extra)
        }
      }
    />
  </div>
}

function normalizeADValue(v: number) {
  if (v === -2) { return '?'    }
  if (v === -1) { return 'X000' }
  return v.toString()
}

function renderTooltip(info: YGOPROCardInfo, extra: string[]) {
  const attrname  = MATTRIBUTE_BY_CODE[info.mattribute]
  const attrimg   = ATTR_TEXTURES[attrname]
  const mtypename = PRETTY_MTYPES[MTYPES_BY_CODE[info.mtype]] + '族'
  const ismonster = info.types.includes('MONSTER')

  return <div className={classnames(FlexV, style.tooltip, info.types)}>
    {
      info && <>
        <div>
          <span className={style.name}>{info.name}</span>
          {
            info.types.includes('MONSTER') && <span className={style.mlevel}>
              {info.mlevel && (info.types.includes('XYZ') ? 'Rank' : info.types.includes('LINK') ? 'Link' : 'Level' ) + '-' + info.mlevel}
            </span>
          }
        </div>

        {
          ismonster ? <>
            <div>
              {mtypename && <span>{[mtypename, ...info.types.map(t => PRETTY_CTYPES[t])].join(' / ')}</span>}
              {attrimg && <span><img src={attrimg} className={style.attr} /></span>}
            </div>
            <div>
              <span>ATK: {normalizeADValue(info.matk)}</span>
              {!info.types.includes('LINK') && <span>DEF: {normalizeADValue(info.mdef)}</span>}
              {info.types.includes('PENDULUM') && <span>SCALE: {info.mscale}</span>}
            </div>
          </> : <div>
            <span>{info.types.map(t => PRETTY_CTYPES[t]).join(' / ')}</span>
          </div>
        }

        <div>
          <div>{ info.desc.split('\r\n').map((seg, i) => <p key={i}>{seg}</p>)}</div>
        </div>

        {
          extra.length !== 0 ? <div>
            <div>{ extra.map((seg, i) => <p key={i}>* {seg}</p>) }</div>
          </div> : <></>
        }
      </>
    }
  </div>
}
