import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateUserBody, UpdateUserBody } from '@primestar/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, type RequestMeta, RequirePermission } from '../common/decorators';
import { UsersService } from './users.service';

class CreateUserDto extends createZodDto(CreateUserBody) {}
class UpdateUserDto extends createZodDto(UpdateUserBody) {}

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'LOCKED', 'DISABLED']).optional(),
  roleId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
class ListQueryDto extends createZodDto(ListQuery) {}

const uuid = new ParseUUIDPipe();

@Controller('users')
@RequirePermission('user.manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.users.get(id);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() body: CreateUserDto, @Meta() meta: RequestMeta) {
    return this.users.create(actor, body, meta);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body() body: UpdateUserDto, @Meta() meta: RequestMeta) {
    return this.users.update(actor, id, body, meta);
  }

  @Post(':id/disable')
  @HttpCode(200)
  disable(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.users.disable(actor, id, meta);
  }

  @Post(':id/enable')
  @HttpCode(200)
  enable(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.users.enable(actor, id, meta);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  unlock(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.users.unlock(actor, id, meta);
  }

  @Post(':id/resend-invite')
  @HttpCode(200)
  resendInvite(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.users.resendInvite(actor, id, meta);
  }

  @Post(':id/require-password-change')
  @HttpCode(200)
  requirePasswordChange(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.users.requirePasswordChange(actor, id, meta);
  }
}
