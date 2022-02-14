import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { Request } from 'express'

@Injectable()
export class AuthGuard implements CanActivate {
  logger = new Logger('AuthGuard')

  canActivate(ctx: ExecutionContext) {
    const req: Request = ctx.switchToHttp().getRequest()
    const user   = req.query.user as string
    const secret = req.query.secret

    if (!G_CONFIG.auth[user] || G_CONFIG.auth[user] !== secret) {
      throw new ForbiddenException()
    }

    return true
  }
}
