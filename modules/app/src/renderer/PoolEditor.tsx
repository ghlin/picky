import { YGOPROCardInfo } from '@picky/shared'
import classnames from 'classnames'
import { usePagination } from 'react-use-pagination'
import style from './PoolEditor.scss'
import { Flex, FlexV, Full, FullW, UI } from './style-common'

export function PoolEditorTable(props: {
  database: YGOPROCardInfo[]
  columns: Array<{
    key:    string
    header: () => JSX.Element,
    render: (info: YGOPROCardInfo, page: YGOPROCardInfo[]) => JSX.Element
  }>
}) {
  const PAGE_SIZE = 10
  const pg        = usePagination({ totalItems: props.database.length, initialPageSize: PAGE_SIZE })
  const rows      = props.database.slice(pg.startIndex, pg.endIndex + 1)

  return <div className={classnames(style.container, FlexV, Full)}>
    <table>
      <thead>
        <tr>
          <th><span>Img</span></th>
          <th><span>Name</span></th>
          <th><span>Type</span></th>
          <th><span>Text</span></th>
          <th><span>Level</span></th>
          <th><span>Scale</span></th>
          <th><span>ATK</span></th>
          <th><span>DEF</span></th>
          { props.columns.map(c => <th key={c.key}>{c.header()}</th>) }
        </tr>
      </thead>

      <tbody>
        {
          rows.map((r, i) => <tr key={r.code + ':' + i}>
            <td className={style.image}><div><img src={'cimg://' + r.code}/></div></td>
            <td className={style.name}><span><span title={r.name}>{r.name}</span></span></td>
            <td className={style.types}><span><span>{r.types.join('/')}</span></span></td>
            <td className={style.desc}><span><span title={r.desc}>{r.desc}</span></span></td>
            <td className={style.misc}><span><span>{r.mlevel}</span></span></td>
            <td className={style.misc}><span><span>{r.mscale}</span></span></td>
            <td className={style.misc}><span><span>{r.matk}</span></span></td>
            <td className={style.misc}><span><span>{r.mdef}</span></span></td>
            { props.columns.map(c => <td key={c.key + ':' + i}>{c.render(r, rows)}</td>) }
          </tr>)
        }
      </tbody>

      <tfoot>
        <tr>
          <td colSpan={8 + props.columns.length} className={FullW}>
            <div className={classnames(Flex, Full)}>
              <span>{props.database.length} items</span>
              {rows.length !== 0 && <span>{rows.length} showing ({pg.startIndex + 1} ~ {pg.endIndex + 1})</span>}
              <button className={UI} disabled={!pg.previousEnabled} onClick={pg.setPreviousPage}>Prev</button>
              <span> page {pg.currentPage} of {pg.totalPages}</span>
              <button className={UI} disabled={!pg.nextEnabled} onClick={pg.setNextPage}>Next</button>
            </div>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
}
