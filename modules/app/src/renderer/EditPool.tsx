import { atoi10, Preset, YGOPROCardInfo } from '@picky/shared'
import classnames from 'classnames'
import FileSaver from 'file-saver'
import { useEffect, useMemo, useState } from 'react'
import usePromise from 'react-use-promise'
import style from './EditPool.scss'
import { PoolEditorTable } from './PoolEditor'
import { Flex, FlexV, Full, FullW, UI } from './style-common'

export function EditPool() {
  const SERVER_URL        = localStorage.getItem('SERVER_URL') || 'http://49.232.147.104:5003'
  const [database]        = usePromise(() => window.ipc.database(), [])
  const [marks, setMarks] = useState<Record<any, string[]>>({})
  const tags = [
    'Main', 'Ex', 'MONSTER', 'SPELL', 'TRAP',
    'T1', 'T2', 'T3', 'T4', 'T5',
    'G1', 'G2', 'FALLBACK', 'DELETE'
  ]

  const [targetPoolId, setTargetPoolId] = useState<string>('')
  const [filterText,   setFilterText]   = useState<string>()
  const [filterExpr,   setFilterExpr]   = useState<string>()
  const [pool,         setPool]         = useState<Preset.Pool>()
  const [filters,      setFilters]      = useState<Record<any, any>>()

  const [holding,     setHolding]     = useState<YGOPROCardInfo>()
  const [attachments, setAttachments] = useState<Record<any, number[]>>({})

  const attach = (target: number, attachment: number) => setAttachments(a => ({
    ...a,
    [target]: (a[target] ?? []).filter(x => x !== attachment).concat(attachment)
  }))
  const detach = (target: number, attachment: number) => setAttachments(a => ({
    ...a,
    [target]: (a[target] ?? []).filter(x => x !== attachment)
  }))

  const [pools] = usePromise(async () => {
    const response = await fetch(SERVER_URL + '/pool')
    const pools = await response.json()
    if (pools.length === 1) { setTargetPoolId(pools[0].id) }

    return pools as Preset.Pool[]
  }, [])

  const filtered = useMemo(() => {
    const original = database ?? []
    const filter   = filterExpr && (() => {
      try {
        return Preset.parseTagFilterExpr(filterExpr.toLowerCase())
      } catch (e) { return undefined }
    })()

    return original
      .filter(info => !filters    || filters[info.code])
      .filter(info => !filterText || info.name.includes(filterText))
      .filter(info => !filter     || Preset.matchTags(marks[info.code]?.map(x => x.toLowerCase()) ?? [], filter))
  }, [database, filterText, filterExpr, filters])

  useEffect(() => {
    if (!targetPoolId) { return }

    fetch(SERVER_URL + '/pool/' + targetPoolId)
      .then(response => response.json())
      .then(setPool)
  }, [targetPoolId])

  return <div className={classnames(FlexV, Full, style.container)}>
    <div className={classnames(FlexV, FullW)}>
      <div className={classnames(Flex, FullW)}>
        <label htmlFor='filter-pool'>Load pool:</label>
        <select
          id='filter-pool'
          value={targetPoolId ?? ''}
          className={classnames(UI, FullW)}
          onChange={e => setTargetPoolId(e.target.value)}
        >
          {
            (pools ?? []).map(pool => <option key={pool.id} value={pool.id}>
              {pool.name}
            </option>)
          }
        </select>

        <button
          className={UI}
          disabled={!pool}
          onClick={
            () => setFilters(
              fs => pool!.items.reduce((dict, item) => (item.pack.forEach(k => dict[k] = true), dict), { ...fs })
            )
          }
        >
          Filter:Add
        </button>

        <button
          className={UI}
          disabled={!pool}
          onClick={
            () => setFilters(
              () => pool!.items.reduce((dict, item) => (item.pack.forEach(k => dict[k] = true), dict), ({ }) as any)
            )
          }
        >
          Filter:Set
        </button>

        <button
          className={UI}
          onClick={() => setFilters(undefined)}
        >
          Reset
        </button>

        <button
          className={UI}
          disabled={!pool}
          onClick={
            () => setMarks(
              fs => pool!.items.reduce((dict, item) => (item.pack.forEach(k => dict[k] = [...dict[k] ?? [], ...item.tags]), dict), { ...fs })
            )
          }
        >
          Apply tags
        </button>
        <span>|</span>
        <button
          className={UI}
          onClick={
            () => {
              const items = Object.entries(marks)
                .map(([key, tags]) => ({ pack: [atoi10(key)].concat(attachments[key] ?? []), tags }))
                .filter(item => item.tags.length)

              FileSaver.saveAs(
                new Blob([JSON.stringify(items, null, 2)], { type: 'text/plain; charset=utf-8' }),
                'pool.export.json'
              )
            }
          }
        >
          Export
        </button>
      </div>
      <div className={classnames(Flex, FullW)}>
        <label htmlFor='filter-text'>Filter text:</label>
        <input id='filter-text' type='text' value={filterText} onChange={e => setFilterText(e.target.value)} className={classnames(UI, FullW)} />
      </div>
      <div className={classnames(Flex, FullW)}>
        <label htmlFor='filter-tags'>Filter tags:</label>
        <input
          id='filter-tags'
          type='text'
          value={filterExpr}
          className={classnames(UI, FullW)}
          onChange={
            e => setFilterExpr(e.target.value)
          }
        />
      </div>
      <div className={classnames(Flex, FullW)}>
        <span style={{ flex: 1 }}>Holding: { holding ? holding.name : '<none>' }</span>
        <span style={{ flex: 1 }}>Attachments: { holding ? attachments[holding.code]?.join('/') ?? '[]' : '<none>' }</span>
        <button
          className={UI}
          disabled={!holding}
          onClick={() => setHolding(undefined)}
        >
          Release
        </button>
      </div>
    </div>

    <PoolEditorTable
      database={filtered}
      columns={
        [
          {
            // TODO: popup 2022-02-15 15:43:45
            key:    'tags',
            header: () => <span>Tags</span>,
            render: info => {
              const cmarks = marks[info.code] ?? []
              const mark = (tag: string, tagged: boolean) => setMarks(prev => {
                const mark = (prev[info.code] ?? []).filter(t => t !== tag)
                const updated = tagged ? mark.concat(tag) : mark
                return { ...prev, [info.code]: updated }
              })

              return <div className={classnames(FullW, style.taggingcell)}>
                <div className={classnames(FullW, Flex, style.ctrls)}>
                  {
                    tags.map(t => <div className={classnames(style.ctrl)} key={t}>
                      <a
                        onClick={() => mark(t, cmarks.includes(t) ? false : true)}
                        className={classnames({ [style.marked]: cmarks.includes(t)})}
                      >
                        {t}
                      </a>
                    </div>)
                  }

                  <div className={style.ctrl}>
                    <a onClick={() => setHolding(info)}>+Hold</a>
                  </div>

                  {
                    holding && <div className={style.ctrl}>
                      <a onClick={() => attach(holding.code, info.code)}>+Attach</a>
                    </div>
                  }

                  {
                    holding && (attachments[holding.code]?.includes(info.code)) && <div className={style.ctrl}>
                      <a onClick={() => detach(holding.code, info.code)}>-Detach</a>
                    </div>
                  }
                </div>
              </div>
            }
          }
        ]
      }
    />
  </div>
}
