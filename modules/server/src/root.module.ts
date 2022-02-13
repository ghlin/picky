import { Module } from '@nestjs/common'
import { DraftGateway } from './draft.gateway'
import { PoolController } from './pool.controller'
import { PresetService } from './preset.service'

@Module({
  providers: [
    DraftGateway,
    PresetService,
  ],
  controllers: [
    PoolController
  ]
})
export class RootModule { }
