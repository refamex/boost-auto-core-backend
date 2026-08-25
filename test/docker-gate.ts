import { execSync } from 'node:child_process';

/**
 * The shared Docker gate for every Testcontainers suite.
 *
 * Locally, a developer without Docker gets skipped suites rather than a wall
 * of failures. That convenience is also how `inventory-bulk-stock.e2e-spec.ts`
 * stayed broken for days: it queried a column the id migration had removed,
 * and nobody saw it because nothing ran it.
 *
 * So under CI the skip is a LIE. A suite that never ran has proven nothing,
 * and a green pipeline that proved nothing is worse than a red one — it
 * actively reports safety it did not observe. When `CI` is set we refuse to
 * skip and fail loudly instead, which is the only thing that makes the
 * pipeline's green mean what a reader assumes it means.
 *
 * Set `ALLOW_SKIP_DOCKER_TESTS=1` to opt out deliberately (a CI job that is
 * genuinely not provisioned for containers). Naming it is the point: it turns
 * a silent hole into a decision someone signed.
 */
const dockerAvailable = (): boolean => {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const resolveGate = (): typeof describe => {
  if (dockerAvailable()) return describe;

  if (process.env.CI && process.env.ALLOW_SKIP_DOCKER_TESTS !== '1') {
    throw new Error(
      'Docker is unavailable, so this end-to-end suite cannot run. ' +
        'Refusing to skip under CI: a skipped suite is not a passing suite, ' +
        'and reporting it as green would claim coverage that never executed. ' +
        'Provision Docker on the runner, or set ALLOW_SKIP_DOCKER_TESTS=1 to ' +
        'accept the gap deliberately.',
    );
  }

  return describe.skip;
};

/**
 * Use instead of `describe` in any suite that needs a container.
 *
 * Treat a skipped run as NO evidence, not as a pass.
 */
export const describeWithDocker: typeof describe = resolveGate();
