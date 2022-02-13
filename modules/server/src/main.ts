import { Logger, LoggerService } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { inspect } from 'util'
import { AppModule } from './app.module'
import { LOG } from './util'

async function bootstrap() {
  const basedir  = normalize(join(__dirname, '..', '..', '..'))
  const confpath = join(basedir, 'config.json')

  LOG.info(``)
  LOG.info(`========================${''.padStart(confpath.length, '=')}====`)
  LOG.info(`=== Bootstrapping       ${''.padStart(confpath.length)} ===`)
  LOG.info(`=== reading config file ${confpath} ===`)
  LOG.info(`========================${''.padStart(confpath.length, '=')}====`)
  LOG.info(``)

  global.G_CONFIG = await readFile(confpath)
    .then(s => JSON.parse(s.toString()))
    .catch(() => {})

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { // {{{
    logger: new class implements LoggerService {
      log(message: any, context?: string) {
        this._format(context, message).forEach(line => LOG.info(line))
      }

      error(message: any, trace?: string, context?: string) {
        this._format(context, message).forEach(line => LOG.error(line))
        if (trace) {
          this._format(context, trace).forEach(line => LOG.error(line))
        }
      }

      warn(message: any, context?: string) {
        this._format(context, message).forEach(line => LOG.warn(line))
      }

      debug(message: any, context?: string) {
        this._format(context, message).forEach(line => LOG.debug(line))
      }

      verbose(message: any, context?: string) {
        this._format(context, message).forEach(line => LOG.verbose(line))
      }

      /** these are annoying... */
      private _hidectxs = ['RouterExplorer', 'RoutesResolver', 'InstanceLoader', 'NestFactory']

      private _format(context = '', message: any) {
        if (context && this._hidectxs.includes(context)) { return [] }

        const text = typeof message === 'string' ? message : inspect(message, false, null, false)
        const lines = text.split('\n').map(s => s.trimEnd())

        return lines.map(line => context.padEnd(20) + ' - ' + line)
      }
    }
  }) // }}}

  app.enableCors({ origin: '*' })
  app.disable('x-powered-by')

  const port = parseInt(process.argv[2] || '3000')
  await app.listen(port)

  new Logger('Bootstrapping').log(`Application is listening on ${await app.getUrl()}`)
}

bootstrap()
