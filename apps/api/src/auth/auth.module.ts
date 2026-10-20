import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUserService } from './auth-user.service';
import { LinkService } from './link.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [
    JwtModule.register({}),
    // 120 requests a minute per IP for everything; auth routes set a tighter limit themselves.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthUserService,
    LinkService,
    PasswordService,
    SessionService,
    // Order matters: rate limit first, then the access check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AuthUserService, LinkService, SessionService, PasswordService],
})
export class AuthModule {}
