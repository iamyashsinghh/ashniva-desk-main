import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MAX_AVATAR_BYTES, type AuthenticatedUser, type UserAvatar } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SetAvatarPresetDto } from './dto/user-avatar.dto';
import { UserAvatarService, type UploadedAvatar } from './user-avatar.service';

/**
 * Profile pictures.
 *
 * No permission decorator on any route, deliberately: changing your own picture and seeing a
 * colleague's face are things every signed-in person does, and the service scopes both — the
 * writes to the caller, the read to the caller's organization.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserAvatarController {
  constructor(private readonly avatars: UserAvatarService) {}

  @Post('me/avatar')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload your profile photo (JPEG, PNG or WebP, 2 MB max)' })
  upload(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: UploadedAvatar | undefined,
  ): Promise<UserAvatar> {
    return this.avatars.uploadPhoto(actor, file);
  }

  @Put('me/avatar')
  @ApiOperation({ summary: 'Use a built-in picture instead of a photo' })
  choosePreset(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SetAvatarPresetDto,
  ): Promise<UserAvatar> {
    return this.avatars.choosePreset(actor, dto.preset);
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove your picture (initials are drawn instead)' })
  clear(@CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.avatars.clear(actor);
  }

  @Get(':id/avatar')
  // Safe to keep forever: every change produces a new `?v=`, so a cached copy is never stale.
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @ApiOperation({
    summary: 'A person’s profile photo',
    description:
      'Yourself or anybody in your current organization. Everybody else, and a person without a ' +
      'photo, is 404. Call as `/users/:id/avatar?v=<UserAvatar.version>`.',
  })
  async photo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const photo = await this.avatars.openPhoto(actor, id);
    return new StreamableFile(photo.stream, {
      type: photo.contentType,
      ...(photo.sizeBytes !== undefined ? { length: photo.sizeBytes } : {}),
      disposition: 'inline',
    });
  }
}
