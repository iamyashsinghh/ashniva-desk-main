/**
 * API (end-to-end) tests: run against a real PostgreSQL, Redis and S3 service.
 * One worker: every suite shares the same database and the same demo data, so running them in
 * parallel makes assertions about counts and inboxes race against each other.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  setupFiles: ['<rootDir>/test/load-env.ts'],
  testTimeout: 30000,
  /**
   * One worker, still strictly serial — and a worker rather than `--runInBand`.
   *
   * `--runInBand` runs every suite in the Jest process itself, which keeps each suite's module
   * registry alive for the whole run: forty applications' worth of Nest graphs, Prisma clients and
   * compiled modules, none of them collectable, growing by roughly 70 MB a suite. On a machine
   * with a large default heap that is invisible. A GitHub runner gives node about 2 GB, and the
   * run died with "Reached heap limit Allocation failed" two thirds of the way through — a
   * failure with no failing test in it.
   *
   * A worker process is the same serial execution (`maxWorkers: 1` — one worker, one suite at a
   * time, same database, same ordering) with one thing added: Jest checks the worker's heap
   * between files and restarts it past the limit below, which is the only thing that actually
   * releases a finished suite's registry. The cost is a few seconds of re-import per restart.
   *
   * The limit is set here rather than in a workflow so a local run and CI agree about it. It has
   * headroom for the heaviest single suite (`production-readiness.e2e-spec.ts`, which builds nine
   * applications in isolated registries and peaks near 950 MB on its own): 700 + 950 stays under
   * the runner's 2 GB, which is what makes this reproducible on a laptop instead of only on CI.
   */
  maxWorkers: 1,
  workerIdleMemoryLimit: '700MB',
};
