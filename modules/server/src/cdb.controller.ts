import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { CdbService } from './CdbService'

@Controller('cdb')
export class CdbController {
  constructor(readonly db: CdbService) { }

  @Get('/:id')
  byCode(@Param('id', new ParseIntPipe) id: number) {
    return this.db.entries.get(id)
  }

  @Get()
  listAll() {
    return this.db.records
  }

}
