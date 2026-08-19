export const SYNC_LOCK = Symbol('SYNC_LOCK');

/**
 * Cluster-wide mutual exclusion for scheduled jobs.
 *
 * The cron fires independently on every running instance, so without this two
 * replicas would import the same feed concurrently and race on the same rows.
 */
export interface SyncLock {
  /** Returns false when the lock is already held elsewhere. Never blocks. */
  tryAcquire(key: number): Promise<boolean>;
  release(key: number): Promise<void>;
}
