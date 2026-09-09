import 'dotenv/config';

import { defineConfig } from 'prisma/config';

// `prisma generate` (CI lint/build jobs, Docker image builds) needs no database, so a placeholder
// keeps it working when DATABASE_URL is absent. migrate, seed and studio require the real value.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
