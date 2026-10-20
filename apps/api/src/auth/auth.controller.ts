import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  RefreshBody,
  TokenPasswordBody,
} from '@primestar/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AllowPasswordChange, AuthOnly, type AuthUser, CurrentUser, Meta, Public, type RequestMeta } from '../common/decorators';
import { AuthService } from './auth.service';

class LoginDto extends createZodDto(LoginBody) {}
class RefreshDto extends createZodDto(RefreshBody) {}
class ForgotPasswordDto extends createZodDto(ForgotPasswordBody) {}
class TokenPasswordDto extends createZodDto(TokenPasswordBody) {}
class ChangePasswordDto extends createZodDto(ChangePasswordBody) {}
class LinkInfoDto extends createZodDto(z.object({ kind: z.enum(['invite', 'reset']), token: z.string().min(20).max(200) })) {}

/** 10 requests a minute per IP on every public auth route (Architecture doc, section 12). */
const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Meta() meta: RequestMeta) {
    return this.auth.login(body, meta);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshDto, @Meta() meta: RequestMeta) {
    return this.auth.refresh(body.refreshToken, meta);
  }

  @AuthOnly()
  @AllowPasswordChange()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('forgot')
  @HttpCode(202)
  async forgot(@Body() body: ForgotPasswordDto) {
    const { devResetLink } = await this.auth.forgotPassword(body);
    // The same answer whether or not the email has an account. Outside production it also carries the link.
    return { message: 'If an active account exists for that email, a reset link has been sent.', devResetLink };
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Get('link-info')
  linkInfo(@Query() query: LinkInfoDto) {
    return this.auth.linkInfo(query.kind, query.token);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('reset')
  @HttpCode(204)
  async reset(@Body() body: TokenPasswordDto): Promise<void> {
    await this.auth.resetPassword(body);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('accept-invite')
  @HttpCode(200)
  acceptInvite(@Body() body: TokenPasswordDto, @Meta() meta: RequestMeta) {
    return this.auth.acceptInvite(body, meta);
  }

  @AuthOnly()
  @AllowPasswordChange()
  @Throttle(AUTH_LIMIT)
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() body: ChangePasswordDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.auth.changePassword(user, body, meta);
  }

  @AuthOnly()
  @AllowPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
