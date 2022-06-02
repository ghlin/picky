import { Module } from '@nestjs/common'
import { CdbController } from './cdb.controller'
import { CdbService } from './CdbService'
import { DraftGateway } from './draft.gateway'
import { PoolController } from './pool.controller'
import { PresetService } from './preset.service'
import { TaggingController } from './tagging-controller'

@Module({
  providers: [
    DraftGateway,
    PresetService,
    CdbService
  ],
  controllers: [
    PoolController,
    TaggingController,
    CdbController
  ]
})
export class RootModule { }
