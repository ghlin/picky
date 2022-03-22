import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common'
import { Preset } from '@picky/shared'
import YAML from 'yaml'
import { AuthGuard } from './auth.guard'
import { PresetService } from './preset.service'

@Controller()
export class PoolController {
  constructor(readonly preset: PresetService) { }

  @Get('/pool/:id')
  getPoolById(@Param('id') id: string) {
    const pool = this.preset.pools.get(id)
    if (!pool) { throw new NotFoundException() }
    return pool
  }

  @Get('/pool')
  pools() {
    return Array.from(this.preset.pools.values()).map(p => ({ id: p.id, name: p.name }))
  }

  @Post('/pool')
  @UseGuards(AuthGuard)
  createPool(@Body() pool: Preset.Pool) {
    if (this.preset.pools.has(pool.id)) {
      throw new ConflictException()
    }
    this.preset.pools.set(pool.id, pool)
  }

  @Put('/pool/:id')
  @UseGuards(AuthGuard)
  updatePool(@Param('id') id: string, @Body() pool: Preset.Pool) {
    this.preset.pools.set(id, pool)
  }

  @Delete('/pool/:id')
  deletePool(@Param('id') id: string) {
    this.preset.pools.delete(id)
  }

  @Get('/preset/:id')
  getPresetById(@Param('id') id: string) {
    return this.preset.presets.get(id)
  }

  @Get('/preset')
  presets() {
    return Array.from(this.preset.presets.values()).map(p => ({ id: p.id, name: p.name, description: p.description }))
  }

  @Post('/preset')
  @UseGuards(AuthGuard)
  createPreset(@Body() template: string) {
    const root   = YAML.parse(template, { merge: true, prettyErrors: true })
    const preset = this.preset.createFromTemplate(root)
    if (this.preset.presets.has(root)) { throw new ConflictException() }

    this.preset.presets.set(preset.id, preset)
  }

  @Put('/preset/:id')
  updatePreset(@Param('id') id: string, @Body() template: string) {
    const root   = YAML.parse(template, { merge: true, prettyErrors: true })
    const preset = this.preset.createFromTemplate(root)
    this.preset.presets.set(id, preset)
  }

  @Delete('/preset/:id')
  deletePreset(@Param('id') id: string) {
    this.preset.presets.delete(id)
  }
}
