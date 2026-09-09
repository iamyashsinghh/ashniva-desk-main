import { Module } from '@nestjs/common';

import { CryptoModule } from '../../common/crypto/crypto.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TaskVisibilityModule } from '../tasks/task-visibility.module';
import { CredentialGrantsService } from './credential-grants.service';
import { CredentialRevealService } from './credential-reveal.service';
import { PortalUatController } from './portal-uat.controller';
import { PortalUatService } from './portal-uat.service';
import { QaController } from './qa.controller';
import { QaFailureEffectsService } from './qa-failure-effects.service';
import { QaPassEffectsService } from './qa-pass-effects.service';
import { QaRepository } from './qa.repository';
import { QaScopeService } from './qa-scope.service';
import { QaService } from './qa.service';
import { QaTransitionsService } from './qa-transitions.service';
import { TestAccountResetService } from './test-account-reset.service';
import { TestAccountsController } from './test-accounts.controller';
import { TestAccountsRepository } from './test-accounts.repository';
import { TestAccountsService } from './test-accounts.service';
import { TestEnvironmentsController } from './test-environments.controller';
import { TestEnvironmentsService } from './test-environments.service';
import { UatController } from './uat.controller';
import { UatRepository } from './uat.repository';
import { UatService } from './uat.service';

/**
 * Testing assignments (QA, retest, live verification, UAT), the pass/fail form with evidence,
 * reusable test accounts with encrypted secrets, timed credential grants and the access log, and
 * the client's UAT sign-off on both the internal and the portal side.
 *
 * `CryptoModule` is imported for `SecretCipherService`: a test-account password is encrypted on
 * the way in and decrypted in exactly one place, `CredentialRevealService`.
 * `NotificationsModule` is imported so a test result can tell the people waiting on it, and
 * `OrganizationsModule` so a client's portal request can find the provider that raised it.
 */
@Module({
  imports: [CryptoModule, NotificationsModule, OrganizationsModule, TaskVisibilityModule],
  controllers: [
    QaController,
    TestAccountsController,
    TestEnvironmentsController,
    UatController,
    PortalUatController,
  ],
  providers: [
    QaRepository,
    TestAccountsRepository,
    UatRepository,
    QaScopeService,
    QaService,
    QaTransitionsService,
    QaFailureEffectsService,
    QaPassEffectsService,
    TestAccountsService,
    TestAccountResetService,
    CredentialGrantsService,
    CredentialRevealService,
    TestEnvironmentsService,
    UatService,
    PortalUatService,
  ],
  exports: [QaRepository, QaService, TestAccountsRepository, UatRepository],
})
export class QaModule {}
