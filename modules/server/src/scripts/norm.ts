import { defined, YGOPROCardInfo } from '@picky/shared'
import { readFile, writeFile } from 'fs/promises'
import { LOG } from '../util'

async function main() {
  const [dbfile, infile] = process.argv.slice(2)
  LOG.info(`dbfile - ${dbfile}, infile - ${infile}`)

  const db = await readFile(dbfile)
    .then(c => JSON.parse(c.toString()))
    .then((items: YGOPROCardInfo[]) => new Map(items.map(i => [i.code, i])))

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

    return { pack: item.pack, tags }
  })
  .filter(defined)

  writeFile('norm.pool.json', JSON.stringify({ items: normalized }, null, 2))
}

main().catch(console.error)
