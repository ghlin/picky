import { CTYPES, YGOPROCardInfo } from '@picky/shared'
import { readFile } from 'fs/promises'
import { getAssetPath } from './util'

const initSqlJs = (require)('./sql.js')
const instance  = initSqlJs({ locateFile: () => getAssetPath('sqljs.wasm') })

export async function loadCDB(path: string) {
  const SQL = await instance
  const db  = await readFile(path).then(b => new SQL.Database(b))

  const sql = `
     SELECT
        datas.id as code,
          alias,
          type as _type,
          level as _level,
          attribute,
          race,
          atk,
          def,
          texts.name as name,
          texts.desc as desc
      FROM datas, texts
      WHERE datas.id = texts.id
  `
  const rows: any[] = db.exec(sql)?.[0]?.values ?? []
  const records = rows .map(([code, alias, _type, _level, attribute, race, atk, def, name, desc]) => {
    const level  = _level & 0xFF
    const lscale = (_level >> 24) & 0xFF

    const ci: YGOPROCardInfo = {
      code:       code,
      name:       name,
      desc:       desc,
      alias:      alias,
      mlevel:     level,
      mscale:     lscale,
      types:      Object.entries(CTYPES).filter(([_, val]) => _type & val).map(([tag]) => tag as any),
      archtypes:  [],
      mtype:      race,
      mattribute: attribute,
      matk:       atk,
      mdef:       (_type & CTYPES.LINK) ? 0 : def
    }

    return ci
  })

  const dict = new Map(records.map(r => [r.code, r]))

  return { dict, records }
}
