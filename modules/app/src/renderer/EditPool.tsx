import { atoi10, Model, YGOPROCardInfo } from '@picky/shared'
import classnames from 'classnames'
import FileSaver from 'file-saver'
import { useEffect, useState } from 'react'
import usePromise from 'react-use-promise'
import style from './EditPool.scss'
import { PoolEditorTable } from './PoolEditor'
import { Flex, FlexV, Full, FullW, UI } from './style-common'

function Tagging(
  props: {
    tags:   string[]
    info:   YGOPROCardInfo,
    marks:  string[]
    mark:   (tag: string, tagged: boolean) => void
  }
) {
  return <div className={classnames(FullW, style.taggingcell)}>
    <div className={classnames(FullW, Flex, style.ctrls)}>
      {
        props.tags.map(t => <div className={classnames(style.ctrl)} key={t}>
          <a
            onClick={() => props.mark(t, props.marks.includes(t) ? false : true)}
            className={classnames({ [style.marked]: props.marks.includes(t)})}
          >
            {t}
          </a>
        </div>)
      }
    </div>
  </div>
}

export function EditPool() {
  const SERVER_URL        = localStorage.getItem('SERVER_URL') || 'http://49.232.147.104:5003'
  const [database]        = usePromise(() => window.ipc.database(), [])
  const [marks, setMarks] = useState<Record<any, string[]>>({})
  const tags = [
    'MAIN', 'EXTRA', 'Ex', 'Spec', 'Gen', 'T00', 'T05', 'T10', 'T15', 'T20', 'T*'
  ]
  const [targetPoolId, setTargetPoolId] = useState<string>('')
  const [filterText, setFilterText] = useState<string>()
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [pool, setPool] = useState<Model.Pool>()
  const [filters, setFilters] = useState<Record<any, any>>()
  const [pools] = usePromise(async () => {
    const response = await fetch(SERVER_URL + '/pool')
    const pools = await response.json()
    if (pools.length === 1) { setTargetPoolId(pools[0].id) }

    return pools as Model.Pool[]
  }, [])

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
                .map(([key, tags]) => ({ id: atoi10(key), tags }))
                .filter(item => item.tags.length)
              FileSaver.saveAs(
                new Blob([JSON.stringify(items, null, 2)], { type: 'text/plain; charset=utf-8' }),
                'pool.json'
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
          value={filterTags.join(';')}
          className={classnames(UI, FullW)}
          onChange={
            e => setFilterTags(e.target.value.split(';').map(x => x.trim()))
          }
        />
      </div>
    </div>
    <PoolEditorTable
      database={
        (database ?? [])
          .filter(info => !filters || filters[info.code])
          .filter(info => !filterText || info.name.includes(filterText))
        .filter(info => filterTags.length === 0 || filterTags.every(t => !t || marks[info.code]?.some(x => x.toLowerCase() === t.toLowerCase())))
      }
      columns={
        [
          {
            key:    'tags',
            header: () => <span>Tags</span>,
            render: info => <Tagging
              tags={tags}
              info={info}
              marks={marks[info.code] ?? []}
              mark={
                (tag, tagged) => setMarks(prev => {
                  const mark = (prev[info.code] ?? []).filter(t => t !== tag)
                  const updated = tagged ? mark.concat(tag) : mark
                  return { ...prev, [info.code]: updated }
                })
              }
            />
          }
        ]
      }
    />
  </div>
}
