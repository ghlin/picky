import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common'
import { PresetService } from './preset.service'

@Controller('/pool')
export class PoolController {
  constructor(readonly preset: PresetService) { }

  @Get('/:id')
  getById(@Param('id') id: string) {
    const pool = this.preset.pools.get(id)
    if (!pool) { throw new NotFoundException() }
    return pool
  }

  @Get()
  list() {
    return Array.from(this.preset.pools.values()).map(p => ({ id: p.id, name: p.name }))
  }

  @Post()
  create() {
    // TODO: 2022-02-12 22:05:08
  }
}
