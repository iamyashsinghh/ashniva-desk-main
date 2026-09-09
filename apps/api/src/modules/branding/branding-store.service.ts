import { Injectable, Logger } from '@nestjs/common';
import { storedBrandingSchema, type StoredBranding } from '@ashniva/types';

import { OrganizationsRepository } from '../organizations/organizations.repository';

/**
 * The one place `organizations.settings.branding` is read and written.
 *
 * It is a JSON blob on a column that also holds unrelated settings, so every read has to be
 * defensive about its shape and every write has to leave the rest of the column alone. Doing
 * that in two places would eventually mean doing it two ways, and the difference would be a
 * setting somebody's save quietly deleted.
 *
 * **There are two readings, and which one a caller wants depends on who is watching.**
 *
 *  * `read`/`readFor` are **lenient**: a blob that does not parse is logged and treated as no
 *    overrides at all. These are the readings on the paths a person who is not signed in
 *    depends on — `GET /branding`, `GET /branding/logo` and the local theme source behind them.
 *    A row Desk cannot read there has to cost that tenant their customisation and nothing more,
 *    because the alternative is a 500 on the first request the sign-in page makes and a login
 *    screen that cannot render. Rows written before a rule tightened are the ordinary way to get
 *    one: `logoUrl` used to admit any URL `new URL()` would parse, and a theme could only be set
 *    by editing this column by hand.
 *  * `readStrict`/`readStrictFor` refuse instead, and are used by the Admin → Branding screen —
 *    the one screen whose subject *is* this row, whose reader can act on the failure, and where
 *    a wrong brand colour served quietly is worse than a loud failure.
 *
 * Documents arriving from *outside* Desk are lenient for a related reason; see
 * `parseThemeDocument`.
 */
@Injectable()
export class BrandingStore {
  private readonly logger = new Logger(BrandingStore.name);

  constructor(private readonly organizations: OrganizationsRepository) {}

  /** The stored overrides, or an empty object when there are none — or none that can be read. */
  read(settings: unknown): StoredBranding {
    const branding = brandingBlob(settings);
    if (branding === null) {
      return {};
    }
    const parsed = storedBrandingSchema.safeParse(branding);
    if (parsed.success) {
      return parsed.data;
    }
    // The field names only. The values are what failed validation, and an unvalidated value from
    // a database row has no business being interpolated into a log line.
    this.logger.warn(
      'Ignoring unreadable stored branding and serving the built-in theme instead. ' +
        `Fields: ${fieldsOf(parsed.error.issues)}`,
    );
    return {};
  }

  /** The same reading, refused rather than fallen back on. For the screen that can fix it. */
  readStrict(settings: unknown): StoredBranding {
    const branding = brandingBlob(settings);
    return branding === null ? {} : storedBrandingSchema.parse(branding);
  }

  async readFor(organizationId: string): Promise<StoredBranding> {
    const organization = await this.organizations.findById(organizationId);
    return this.read(organization?.settings);
  }

  async readStrictFor(organizationId: string): Promise<StoredBranding> {
    const organization = await this.organizations.findById(organizationId);
    return this.readStrict(organization?.settings);
  }

  /**
   * Replaces the branding key, leaving every other setting untouched.
   *
   * Read-modify-write on a JSON column is a lost-update race in principle. It is left as one on
   * purpose: the only writer is an administrator on a settings screen, the loser of a race is a
   * branding change made in the same second by a second administrator, and the alternative —
   * locking the organization row on every branding save — costs more than the problem.
   */
  async write(organizationId: string, branding: StoredBranding): Promise<void> {
    const organization = await this.organizations.findById(organizationId);
    const settings =
      typeof organization?.settings === 'object' && organization.settings !== null
        ? (organization.settings as Record<string, unknown>)
        : {};
    await this.organizations.updateSettings(organizationId, { ...settings, branding });
  }
}

/** The `branding` key of a settings column, or null when the column holds no object there. */
function brandingBlob(settings: unknown): object | null {
  if (typeof settings !== 'object' || settings === null) {
    return null;
  }
  const branding = (settings as { branding?: unknown }).branding;
  return typeof branding === 'object' && branding !== null ? branding : null;
}

/** Which fields a warning may name. Paths, never values — see the caller. */
function fieldsOf(issues: readonly { readonly path: readonly PropertyKey[] }[]): string {
  const paths = new Set(issues.map((issue) => issue.path.map(String).join('.') || '(root)'));
  return [...paths].join(', ');
}
