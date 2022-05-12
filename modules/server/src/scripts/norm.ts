import { CTYPES, defined, YGOPROCardInfo } from '@picky/shared'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { LOG } from '../util'
// __dirname: <root>/modules/server/src/scripts
// toload:    <root>/modules/app/src/main/sql.js
const rootdir = join(__dirname, '..', '..', '..', '..')

// ../app/src/main/sql.js
const initSqlJs = (require)(join(rootdir, 'modules', 'app', 'src', 'main', 'sql.js'))
const instance  = initSqlJs({
  locateFile: () => join(rootdir, 'modules', 'app', 'assets', 'sqljs.wasm')
})


async function loadCDB(path: string) {
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

async function main() {
  const [dbfile, infile] = process.argv.slice(2)
  LOG.info(`dbfile - ${dbfile}, infile - ${infile}`)

  const { dict: db } = await loadCDB(dbfile)
  const pool: Array<{ pack: number[]; tags: string[] }> = await readFile(infile)
    .then(c => JSON.parse(c.toString()))

  const normalized = pool.map(item => {
    const info = db.get(item.pack[0])
    if (!info) { return undefined }

    const XYZ     = info.types.includes('XYZ')
    const Link    = info.types.includes('LINK')
    const Synchro = info.types.includes('SYNCHRO')

    const Ex      = XYZ || Link || Synchro
    const ensures = [
      Ex ? 'Ex' : 'Main',
      `L${info.mlevel}`,
      `S${info.mscale}`,
      ...info.types
    ]
    const tags = item.tags.filter(t => !ensures.includes(t)).concat(ensures)
    console.log(`${item.pack[0]} => ${tags.join(', ')}`)

    return { pack: item.pack, tags }
  })
  .filter(defined)

  writeFile('norm.pool.json', JSON.stringify({ items: normalized }, null, 2))
}

main().catch(console.error)
