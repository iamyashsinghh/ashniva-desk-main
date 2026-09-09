-- Ashniva Theme Manager as an integration provider.
--
-- One new enum value and nothing else. No table, no column, no row is touched, so an upgrade over
-- a populated database changes nothing that is already there and there is nothing to roll back
-- beyond the value itself.
--
-- `IntegrationProvider` gains THEME_MANAGER rather than a parallel `theme_providers` table, for
-- the same reason IVR did: the encrypted credentials, the enable switch, the non-secret settings
-- blob that carries the base URL, and the webhook secret and idempotency index that a push-based
-- direction would need all already exist on integration_connections. A second copy of that
-- machinery would be a second thing to keep right.
--
-- A theme itself is not stored here. It lives in organizations.settings.branding, which is a JSON
-- blob with no history and no version column — a gap named in docs/theme-manager-integration.md
-- rather than papered over, because how a published theme is promoted and rolled back is a
-- product question that has not been answered yet.

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'THEME_MANAGER';
