import { Injectable, Logger } from '@nestjs/common'
import { readCDB, YGOPROCardInfo } from '@picky/shared'
import { readFile } from 'fs/promises'
import { join } from 'path'

@Injectable()
export class CdbService {
  logger = new Logger(`CdbService`)

  entries: Map<number, YGOPROCardInfo> = new Map()
  records: YGOPROCardInfo[] = []

  async load() {
    const dbpath = join(G_CONFIG.dirs.assets, 'cards.cdb')
    const buffer = await readFile(dbpath)
    const db = await readCDB(buffer, () => join(G_CONFIG.dirs.assets, 'sqljs.wasm'))
    this.entries = db.dict
    this.records = db.records
  }

  constructor() {
    this.load().then(() => {
      this.logger.log(`cdb load complete: ${this.records.length} records.`)
    })
  }
}
