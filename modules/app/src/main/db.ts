import { readCDB } from '@picky/shared'
import { readFile } from 'fs/promises'
import { getAssetPath } from './util'

export async function loadCDB(path: string) {
  const buffer = await readFile(path)
  return readCDB(buffer, () => getAssetPath('sqljs.wasm'))
}
