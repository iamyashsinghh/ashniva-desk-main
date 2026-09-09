import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

// Tests always run with NODE_ENV=test (dotenv never overrides variables that are already set).
process.env.NODE_ENV = 'test';

// CI sets the variables directly; locally the tests read apps/api/.env.test, then apps/api/.env.
loadDotenv({ path: path.resolve(__dirname, '..', '.env.test') });
loadDotenv({ path: path.resolve(__dirname, '..', '.env') });

// Keep test output readable unless a developer explicitly asks for logs.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';

// Forced, not defaulted: a test run must never be able to reach a real mail server, the
// WhatsApp API, an AI provider or a telephone, whatever a developer happens to have in their
// .env. A test that rings somebody's phone is not a test.
process.env.MESSAGING_PROVIDER = 'mock';
process.env.AI_PROVIDER = 'mock';
process.env.IVR_PROVIDER = 'mock';
process.env.SUPPORT_CALLBACK_TRANSPORT = 'mock';

// Themes come from the deployment's own database unless a suite deliberately says otherwise —
// `theme-manager.e2e-spec.ts` sets this to `remote` before it builds its app, precisely so it can
// prove that an unreachable Theme Manager breaks nothing. Forced here rather than defaulted so a
// developer's own `.env` cannot decide what every other suite is testing.
process.env.THEME_PROVIDER = 'local';
