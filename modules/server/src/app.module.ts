import { Module } from '@nestjs/common'
import { RootModule } from './root.module'

@Module({
  imports: [RootModule]
})
export class AppModule { }
