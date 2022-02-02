import { Module } from '@nestjs/common'
import { DraftGateway } from './draft.gateway'
import { PresetService } from './preset.service'

@Module({
  providers: [
    DraftGateway,
    PresetService,
  ]
})
export class RootModule { }
