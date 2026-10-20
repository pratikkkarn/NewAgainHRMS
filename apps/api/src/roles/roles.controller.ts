import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateRoleBody, UpdateRoleBody } from '@primestar/shared';
import { createZodDto } from 'nestjs-zod';
import { type AuthUser, CurrentUser, Meta, type RequestMeta, RequireAnyPermission, RequirePermission } from '../common/decorators';
import { RolesService } from './roles.service';

class CreateRoleDto extends createZodDto(CreateRoleBody) {}
class UpdateRoleDto extends createZodDto(UpdateRoleBody) {}

const uuid = new ParseUUIDPipe();

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The user form and the alert settings need the role list too, so user and settings managers can read it. */
  @Get()
  @RequireAnyPermission('role.manage', 'user.manage', 'settings.manage')
  list() {
    return this.roles.list();
  }

  @Post()
  @RequirePermission('role.manage')
  create(@CurrentUser() actor: AuthUser, @Body() body: CreateRoleDto, @Meta() meta: RequestMeta) {
    return this.roles.create(actor, body, meta);
  }

  @Patch(':id')
  @RequirePermission('role.manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Body() body: UpdateRoleDto, @Meta() meta: RequestMeta) {
    return this.roles.update(actor, id, body, meta);
  }

  @Delete(':id')
  @RequirePermission('role.manage')
  @HttpCode(204)
  remove(@CurrentUser() actor: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.roles.remove(actor, id, meta);
  }
}
