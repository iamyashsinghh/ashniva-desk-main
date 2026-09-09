import { Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FilesModule } from '../files/files.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AdminBrandingController } from './admin-branding.controller';
import { AdminBrandingService } from './admin-branding.service';
import { BrandingController } from './branding.controller';
import { BrandingStore } from './branding-store.service';
import { BrandingService } from './branding.service';
import { LocalThemeSource } from './theme/local-theme.source';
import { RemoteThemeSource } from './theme/remote-theme.source';
import { ThemeConnectionService } from './theme/theme-connection.service';
import { THEME_SOURCE, type ThemeSource } from './theme/theme-source.interface';

/**
 * Branding: the public theme endpoint, the write path behind it, and where a theme comes from.
 *
 * `THEME_SOURCE` resolves from `THEME_PROVIDER=local|remote`, the same `useFactory` shape the IVR,
 * messaging and AI modules use for their adapters. The default is `local`, so a deployment that
 * says nothing keeps Desk's own stored branding and depends on nothing outside itself.
 *
 * `FilesModule` is imported for one reason and one only: a logo is an ordinary attachment,
 * uploaded through `POST /files` like everything else, and read back here by id. There is no
 * second upload path and no second set of size and content-type rules to keep in step.
 */
@Module({
  imports: [OrganizationsModule, FilesModule, IntegrationsModule, AuditLogsModule],
  controllers: [BrandingController, AdminBrandingController],
  providers: [
    BrandingStore,
    BrandingService,
    AdminBrandingService,
    ThemeConnectionService,
    LocalThemeSource,
    RemoteThemeSource,
    {
      provide: THEME_SOURCE,
      inject: [AppConfigService, LocalThemeSource, RemoteThemeSource],
      useFactory: (
        config: AppConfigService,
        local: LocalThemeSource,
        remote: RemoteThemeSource,
      ): ThemeSource => (config.theme.useRemoteSource ? remote : local),
    },
  ],
  exports: [BrandingService],
})
export class BrandingModule {}
