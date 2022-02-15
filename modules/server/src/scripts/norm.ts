import { defined, YGOPROCardInfo } from '@picky/shared'
import { readFile, writeFile } from 'fs/promises'
import { LOG } from '../util'

async function main() {
  const [dbfile, infile] = process.argv.slice(2)
  LOG.info(`dbfile - ${dbfile}, infile - ${infile}`)

  const db = await readFile(dbfile)
    .then(c => JSON.parse(c.toString()))
    .then((items: YGOPROCardInfo[]) => new Map(items.map(i => [i.code, i])))

  const pool: Array<{ id: number; tags: string[] }> = await readFile(infile)
    .then(c => JSON.parse(c.toString()))
    .then(c => c.items)

  const normalized = pool.map(item => {
    const info = db.get(item.id)
    if (!info) { return undefined }
    const S = item.tags.includes('Spec') || item.tags.includes('Spec-Ex') || item.tags.includes('SpecEx')

    const _T0 = item.tags.includes('T0')
    const _T1 = item.tags.includes('T1')
    const _T2 = item.tags.includes('T2')

    const T = item.tags.includes('T00') ? 1
            : item.tags.includes('T05') ? 2
            : item.tags.includes('T10') ? 3
            : item.tags.includes('T15') ? 4
            : (_T0 && !_T1)             ? 1
            : (_T0 && _T1)              ? 2
            : (_T1 && !_T2)             ? 3
            : (_T1 && _T2)              ? 4
            :                             5

    const G = S ? 2 : 1

    const XYZ     = info.types.includes('XYZ')
    const Link    = info.types.includes('LINK')
    const Synchro = info.types.includes('SYNCHRO')

    const Ex      = XYZ || Link || Synchro
    const tags = [
      Ex ? 'Ex' : 'Main',
      'T' + T,
      'G' + G,
      'P' + (T + G * 2),
      ...info.types
    ]

    return { pack: [item.id], tags }
  })
  .filter(defined)

  writeFile('norm.pool.json', JSON.stringify({ items: normalized }, null, 2))
}

main().catch(console.error)
