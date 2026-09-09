import type { Readable } from 'node:stream';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AdminBrandingView,
  type AuthenticatedUser,
  type BrandingUpdate,
  type StoredBranding,
} from '@ashniva/types';

import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { FilesRepository } from '../files/files.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { BrandingStore } from './branding-store.service';
import { BrandingService } from './branding.service';

/** An image a browser will render as a logo. Deliberately narrower than a general attachment. */
const LOGO_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export interface BrandingLogo {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
}

/**
 * Editing an organization's branding — the write path `branding.module.ts` promised in Phase 1 and
 * that never arrived, leaving a hand-written database row as the only way to change a theme.
 *
 * Two things are worth saying about the shape.
 *
 * **The organization is the actor's own, always.** There is no organization parameter anywhere in
 * this service: an administrator changes their own tenant's branding and there is no argument
 * they could pass to change somebody else's. That is the tenant control, and it is structural
 * rather than a check that could be forgotten.
 *
 * **There is no second upload path.** A logo is an ordinary attachment uploaded through
 * `POST /files`, and what is stored here is its id. `logo()` is a *read* — the sign-in page is
 * unauthenticated and cannot carry a bearer token to `/files/:id/download` — and it takes no id
 * from the caller: it reads the one the organization's own branding names. Being public therefore
 * grants nothing beyond the logo a tenant chose to display on their own login screen.
 */
@Injectable()
export class AdminBrandingService {
  constructor(
    private readonly branding: BrandingService,
    private readonly store: BrandingStore,
    private readonly organizations: OrganizationsRepository,
    private readonly files: FilesRepository,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Everything the branding screen needs: what is in effect, what is overridden, and the source.
   *
   * The stored overrides are read **strictly** here, unlike on the public path. This is the one
   * screen whose subject is that row and whose reader can repair it, so a row Desk cannot read is
   * worth failing on rather than quietly showing as "no overrides" — which would look like a
   * working screen and turn the next save into a silent reset.
   */
  async view(actor: AuthenticatedUser): Promise<AdminBrandingView> {
    const organization = await this.requireOrganization(actor.organizationId);
    return {
      effective: await this.branding.getBranding(organization.slug),
      stored: await this.store.readStrictFor(actor.organizationId),
      themeSource: await this.branding.themeSourceReadiness(actor.organizationId),
    };
  }

  /**
   * Applies the change, field by field.
   *
   * A field that is absent is left alone and a field that is null is cleared, which is why the
   * update type distinguishes the two. The theme is replaced wholesale rather than merged into
   * the stored one: "set these four tokens" and "add these four tokens to whatever is already
   * there" are different intentions, and a screen that shows the whole document is expressing the
   * first. Merging with an earlier state is what a resolved theme is for, at read time.
   *
   * The prior state is read strictly, for the reason `view` is: a save is a read-modify-write, and
   * silently treating an unreadable row as empty would carry every field it held into the audit
   * entry as "was nothing" and delete it.
   */
  async update(actor: AuthenticatedUser, update: BrandingUpdate): Promise<AdminBrandingView> {
    const organization = await this.requireOrganization(actor.organizationId);
    const before = await this.store.readStrictFor(actor.organizationId);
    const next: StoredBranding = { ...before };

    if (update.productName !== undefined) {
      next.productName = update.productName;
    }
    if (update.logoText !== undefined) {
      next.logoText = update.logoText;
    }
    if (update.logoUrl !== undefined) {
      next.logoUrl = update.logoUrl;
    }
    if (update.logoFileId !== undefined) {
      next.logoFileId = await this.checkedLogoFileId(actor.organizationId, update.logoFileId);
    }
    if (update.theme !== undefined) {
      next.theme = update.theme;
      // The legacy three-colour block would otherwise keep overriding the brand colours the new
      // document sets, and an administrator would change a colour and watch nothing happen.
      delete next.colors;
    }

    await this.store.write(actor.organizationId, next);
    await this.auditLog.record({
      action: AUDIT_ACTION.BRANDING_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.BRANDING,
      entityId: actor.organizationId,
      organizationId: actor.organizationId,
      before: brandingDigest(before),
      after: brandingDigest(next),
    });

    return {
      effective: await this.branding.getBranding(organization.slug),
      stored: next,
      themeSource: await this.branding.themeSourceReadiness(actor.organizationId),
    };
  }

  /**
   * The logo bytes for an organization, by slug, for the unauthenticated sign-in page.
   *
   * The file id comes from the organization's own stored branding and never from the request, so
   * this cannot be turned into a way to read an arbitrary attachment. The lookup is still scoped
   * to that organization, so a branding row that names another tenant's file — which the write
   * path refuses, but which a hand-edited row could still contain — resolves to nothing.
   *
   * Unauthenticated, so the reading is the lenient one: a row Desk cannot parse costs this
   * organization its logo, not the sign-in page a 500.
   */
  async logo(organizationSlug?: string): Promise<BrandingLogo> {
    const organization = organizationSlug
      ? await this.organizations.findBySlug(organizationSlug)
      : await this.organizations.findServiceProvider();
    const fileId = organization ? this.store.read(organization.settings).logoFileId : null;
    if (!organization || !fileId) {
      throw new NotFoundException('This organization has no uploaded logo');
    }

    const row = await this.files.findById(organization.id, fileId);
    if (!row || !LOGO_CONTENT_TYPES.has(row.contentType)) {
      throw new NotFoundException('This organization has no uploaded logo');
    }
    const object = await this.storage.client.send(
      new GetObjectCommand({ Bucket: this.storage.bucket, Key: row.storageKey }),
    );
    if (!object.Body) {
      throw new NotFoundException('The logo file is missing from storage');
    }
    return {
      stream: object.Body as Readable,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
    };
  }

  /** A logo must be an image this tenant already uploaded. Both halves matter. */
  private async checkedLogoFileId(
    organizationId: string,
    fileId: string | null,
  ): Promise<string | null> {
    if (fileId === null) {
      return null;
    }
    const row = await this.files.findById(organizationId, fileId);
    if (!row) {
      throw new NotFoundException('That file does not exist in this organization');
    }
    if (!LOGO_CONTENT_TYPES.has(row.contentType)) {
      throw new BadRequestException('A logo must be a PNG, JPEG, WebP or GIF image');
    }
    return fileId;
  }

  private async requireOrganization(organizationId: string) {
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }
}

/**
 * What the audit entry records.
 *
 * The whole token document rather than a diff, because "the theme changed" is not an answer to
 * "who made the portal look like that?" — and it is small, bounded and contains nothing personal.
 */
function brandingDigest(branding: StoredBranding): Record<string, unknown> {
  return {
    productName: branding.productName ?? null,
    logoText: branding.logoText ?? null,
    logoUrl: branding.logoUrl ?? null,
    logoFileId: branding.logoFileId ?? null,
    theme: branding.theme ?? null,
  };
}
