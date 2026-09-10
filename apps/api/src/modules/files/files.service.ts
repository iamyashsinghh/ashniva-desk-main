import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { TaskVisibilityService } from '../tasks/task-visibility.service';
import type { ListFilesQueryDto, UploadFileDto } from './dto/file.dto';
import { FileParentsService } from './file-parents.service';
import { clientMayRead, readableVisibility } from './file-visibility';
import {
  contentMatchesDeclaredType,
  isAllowedContentType,
  MAX_FILE_BYTES,
  sanitizeName,
} from './file-rules';
import { FilesRepository, type FileRow } from './files.repository';

export interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * The most attachments one parent's listing will return.
 *
 * A ceiling rather than pagination: a task, ticket or contract with more than this many documents
 * is not a page of results anybody scrolls, and the point of the bound is that no request can ask
 * the database for an unbounded set. `GET /files` had no `take` at all.
 */
export const MAX_FILES_PER_PARENT = 200;

export interface DownloadableFile {
  stream: Readable;
  name: string;
  contentType: string;
  sizeBytes: number;
}

export function toFileSummary(row: FileRow): FileSummary {
  return {
    id: row.id,
    name: row.name,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility as Visibility,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Files never leave the API: bytes go to S3-compatible storage through the server and come back
 * through it, so the browser needs no direct access to MinIO and every download is checked.
 * Every file row belongs to the service-provider organization; client users may only see rows
 * marked CLIENT that hang off their own projects or tickets.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly organizations: OrganizationsRepository,
    private readonly parents: FileParentsService,
    private readonly auditLog: AuditLogService,
    private readonly visibility: TaskVisibilityService,
  ) {}

  async upload(
    actor: AuthenticatedUser,
    file: UploadedFileInput | undefined,
    dto: UploadFileDto,
  ): Promise<FileSummary> {
    if (!file) {
      throw new BadRequestException('Send the file in the "file" multipart field');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('Files are limited to 10 MB');
    }
    if (!isAllowedContentType(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
    // The declared type is the client's word for it. The bytes are ours.
    if (!contentMatchesDeclaredType(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        `The file's content is not ${file.mimetype}. Upload it with its real type.`,
      );
    }
    const internal = isInternalUser(actor);
    const organizationId = internal ? actor.organizationId : await this.serviceProviderId();
    await this.parents.assertParent(
      actor,
      organizationId,
      dto,
      internal ? await this.visibility.taskWhere(actor) : undefined,
    );

    const name = sanitizeName(file.originalname);
    const storageKey = `${organizationId}/${randomUUID()}/${name}`;
    await this.storage.putObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });
    const row = await this.files.create({
      organizationId,
      uploadedById: actor.userId,
      name,
      contentType: file.mimetype,
      sizeBytes: file.size,
      storageKey,
      // Whatever a client uploads is by definition visible to that client.
      visibility: internal ? (dto.visibility ?? VISIBILITY.INTERNAL) : VISIBILITY.CLIENT,
      taskId: dto.taskId,
      ticketId: dto.ticketId,
      projectId: dto.projectId,
      contractId: dto.contractId,
      milestoneId: dto.milestoneId,
      changeRequestId: dto.changeRequestId,
      approvalId: dto.approvalId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.FILE_UPLOADED,
      entityType: AUDIT_ENTITY_TYPE.FILE,
      entityId: row.id,
      organizationId,
      after: { name, sizeBytes: file.size, taskId: dto.taskId, ticketId: dto.ticketId },
    });
    return toFileSummary(row);
  }

  async list(actor: AuthenticatedUser, query: ListFilesQueryDto): Promise<FileSummary[]> {
    const internal = isInternalUser(actor);
    const organizationId = internal ? actor.organizationId : await this.serviceProviderId();
    await this.parents.assertReadableParent(actor, organizationId, query);
    // A task's attachments are the developer's proof screenshots and documents, so they follow the
    // task's scope. Files on every other parent are governed by that parent's own rules.
    const rows = await this.files.list(organizationId, query, {
      visibility: readableVisibility(actor),
      take: MAX_FILES_PER_PARENT,
      scope: internal ? await this.visibility.fileWhere(actor) : undefined,
    });
    return rows.filter((row) => internal || clientMayRead(actor, row)).map(toFileSummary);
  }

  async download(actor: AuthenticatedUser, id: string): Promise<DownloadableFile> {
    const row = await this.requireDownloadable(actor, id);
    const object = await this.storage.getObject(row.storageKey);
    return {
      stream: object.stream as Readable,
      name: row.name,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
    };
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const row = await this.requireReadable(actor, id);
    if (row.uploadedById !== actor.userId && !isInternalUser(actor)) {
      throw new ForbiddenException('You can only delete files you uploaded');
    }
    // An invoice PDF is not an attachment. Deleting one issues a real `DeleteObjectCommand`, and
    // there is no regeneration path — so any internal user, with no billing permission at all,
    // could irrecoverably destroy a tax document a client had already been sent, while the
    // invoice went on reporting `hasPdf: true` and every download 404'd.
    //
    // Both links, not just the forward one: cancelling nulls `invoices.pdf_file_id` and keeps the
    // document on the history row, so a guard reading only the forward link stops protecting the
    // file at exactly the moment the cancel path promises to keep it.
    if (row.invoicePdfs.length > 0 || row.invoiceHistoryPdfs.length > 0) {
      throw new ForbiddenException(
        'This is an invoice document and cannot be deleted. Cancel or void the invoice instead.',
      );
    }
    await this.files.softDelete(id);
    await this.storage.deleteObject(row.storageKey);
    await this.auditLog.record({
      action: AUDIT_ACTION.FILE_DELETED,
      entityType: AUDIT_ENTITY_TYPE.FILE,
      entityId: id,
      organizationId: row.organizationId,
      after: { name: row.name },
    });
  }

  private async requireReadable(actor: AuthenticatedUser, id: string): Promise<FileRow> {
    const internal = isInternalUser(actor);
    const organizationId = internal ? actor.organizationId : await this.serviceProviderId();
    const row = await this.files.findById(
      organizationId,
      id,
      internal ? await this.visibility.fileWhere(actor) : undefined,
    );
    if (!row || (!internal && !clientMayRead(actor, row))) {
      throw new NotFoundException('File not found');
    }
    return row;
  }

  /**
   * A download runs the same two checks a listing does: the parent's own read permission, and the
   * internal/client visibility flag. Without them, knowing an id was the whole of the access
   * control — and `GET /files` handed those ids to anybody who asked.
   */
  private async requireDownloadable(actor: AuthenticatedUser, id: string): Promise<FileRow> {
    const row = await this.requireReadable(actor, id);
    this.parents.assertReadableFile(actor, row);
    if (row.visibility !== VISIBILITY.CLIENT && readableVisibility(actor) !== undefined) {
      throw new NotFoundException('File not found');
    }
    return row;
  }

  private async serviceProviderId(): Promise<string> {
    const provider = await this.organizations.findServiceProvider();
    if (!provider) {
      throw new NotFoundException('Service provider organization is not configured');
    }
    return provider.id;
  }
}
