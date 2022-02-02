import { inspect } from 'util'
import winston from 'winston'

export class DSError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ? code + ': ' + message : code)
  }
}

export const LOG = winston.createLogger({
  level: 'silly',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(I => {
      const messageLevel = LOG.levels[I.level]   ?? 4 /* verbose */
      const loggerLevel  = LOG.levels[LOG.level] ?? 4

      if (messageLevel > loggerLevel) { return '' }

      const label   = `[${I.timestamp} ${I.level.padStart(7)}]`
      const message = typeof I.message === 'string' ? I.message : inspect(I.message, false, null, false)
      const lines   = message.split('\n')

      if (lines.length === 0) { return label }
      if (lines.length === 1) { return label + ' ' + lines[0] }

      return lines.map(line => line.trimRight()).map(line => {
        return line.length === 0 ? label : label + ' ' + line
      }).join('\n')
    })),
  transports: [new winston.transports.Console()]
})

