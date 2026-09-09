import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type FileSummary } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireAnyPermission } from '../../common/decorators/require-permissions.decorator';
import { ListFilesQueryDto, UploadFileDto } from './dto/file.dto';
import { MAX_FILE_BYTES } from './file-rules';
import { FilesService, type UploadedFileInput } from './files.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        taskId: { type: 'string', format: 'uuid' },
        ticketId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
        visibility: { type: 'string', enum: ['INTERNAL', 'CLIENT'] },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload an attachment (10 MB max) for a task, ticket or project' })
  upload(
    @CurrentUser() actor: AuthenticatedUser,
    // Multer's file shape; typed by the fields the service reads so no global namespace is needed.
    @UploadedFile() file: UploadedFileInput | undefined,
    @Body() dto: UploadFileDto,
  ): Promise<FileSummary> {
    return this.files.upload(actor, file, dto);
  }

  /**
   * The floor, not the whole gate.
   *
   * A file's real gate is the permission on the entity it hangs off, and that differs per row, so
   * it lives in `FileParentsService` where the parent is known. This decorator only says that a
   * caller with no read of either half of the product has no business here at all.
   */
  @Get()
  @RequireAnyPermission(PERMISSIONS.TICKET_READ, PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Attachments of one task, ticket, project, contract, CR or approval' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListFilesQueryDto,
  ): Promise<FileSummary[]> {
    return this.files.list(actor, query);
  }

  @Get(':id/download')
  @RequireAnyPermission(PERMISSIONS.TICKET_READ, PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Download the file (streamed through the API after access checks)' })
  async download(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const file = await this.files.download(actor, id);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      length: file.sizeBytes,
      disposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attachment' })
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.files.remove(actor, id);
  }
}
