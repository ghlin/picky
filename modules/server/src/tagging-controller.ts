import { Body, Controller, Delete, Get, Logger, NotFoundException, Param, ParseIntPipe, Post, Put } from '@nestjs/common'
import { Preset } from '@picky/shared'
import { bufferTime, Subject } from 'rxjs'
import { CdbService } from './CdbService'
import { PresetService } from './preset.service'

@Controller('/tagging')
export class TaggingController {
  logger = new Logger('TaggingController')
  dirty$ = new Subject<string>()
  subscriptions = [
    this.dirty$.pipe(bufferTime(30 * 1000, null, 50)).subscribe(async changed => {
      if (changed.length === 0) { return }

      this.logger.log(`modified: ${changed.join(', ')}`)
      const pools = new Set(changed)
      for (const pool of pools.values()) {
        const p = this.preset.pools.get(pool)
        if (!p) { continue }

        this.logger.log(`about to sync pool: ${pool}`)
        await this.preset.syncPool(p)
      }
    })
  ]

  constructor(
    readonly preset: PresetService,
    readonly db: CdbService
  ) { }

  private _getPool(pool: string) {
    const p = this.preset.pools.get(pool)
    if (!p) { throw new NotFoundException({}, pool) }
    return p
  }

  private _getItem(pool: string | Preset.Pool, id: number) {
    const p = typeof pool === 'string' ? this._getPool(pool) : pool
    const item = p.items[id]
    if (!item) {
      throw new NotFoundException({}, `${pool}/${id}`)
    }
    return item
  }

  private _markDirty(pool: string) {
    this.dirty$.next(pool)
  }

  @Post('/pool/:pool/:id/tags/:tag')
  createTag(
    @Param('pool')                 pool: string,
    @Param('id', new ParseIntPipe) id:   number,
    @Param('tag')                  tag:  string
  ) {
    const item = this._getItem(pool, id)
    item.tags  = Array.from(new Set(item.tags.concat([tag])))
    this._markDirty(pool)

    return item
  }

  @Delete('/pool/:pool/:id/tags/:tag')
  deleteTag(
    @Param('pool')                 pool: string,
    @Param('id', new ParseIntPipe) id:   number,
    @Param('tag')                  tag:  string
  ) {
    const item = this._getItem(pool, id)
    item.tags  = item.tags.filter(t => t !== tag)
    this._markDirty(pool)

    return item
  }

  @Post('/pool/:pool/:id/pack/:pass')
  createCompanied(
    @Param('pool')                   pool:  string,
    @Param('id', new ParseIntPipe)   id:    number,
    @Param('pass', new ParseIntPipe) pass:  number
  ) {
    const item = this._getItem(pool, id)
    item.pack.push(pass)
    this._markDirty(pool)
    return item
  }

  @Delete('/pool/:pool/:id/pack/:pass')
  deleteCompanied(
    @Param('pool')                   pool:  string,
    @Param('id', new ParseIntPipe)   id:    number,
    @Param('pass', new ParseIntPipe) pass:  number
  ) {
    const item = this._getItem(pool, id)
    const pidx = item.pack.indexOf(pass)
    if (pidx !== -1) { item.pack.splice(pidx, 1) }
    this._markDirty(pool)
    return item
  }

  @Post('/pool/:pool')
  createPackItem(
    @Param('pool') pool:  string,
    @Body()        body: { pack: number[]; tags: string[] }
  ) {
    const p = this._getPool(pool)
    p.items.push(body)
    this._markDirty(pool)

    return { id: p.items.length - 1 }
  }

  @Put('/pool/:pool/:id')
  updatePackItem(
    @Param('id', new ParseIntPipe) id:   number,
    @Param('pool')                 pool: string,
    @Body()                        body: { pack: number[]; tags: string[] }
  ) {
    const item = this._getItem(pool, id)
    item.pack = body.pack
    item.tags = body.tags
    this._markDirty(pool)

    return item
  }

  @Get('/pool/:pool/:id')
  getInfo(
    @Param('pool')                 pool: string,
    @Param('id', new ParseIntPipe) id:   number
  ) {
    const p = this.preset.pools.get(pool)
    if (!p) { throw new NotFoundException({}, pool) }
    return p.items[id]
  }

  @Get('/pool/:pool')
  getAll(
    @Param('pool')                 pool: string
  ) {
    const p = this.preset.pools.get(pool)
    if (!p) { throw new NotFoundException({}, pool) }
    return p
  }
}
