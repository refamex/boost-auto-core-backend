import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { SyncLock } from './sync-lock';

/**
 * Session-scoped Postgres advisory lock.
 *
 * `pg_try_advisory_lock` returns immediately instead of queueing, which is what
 * a scheduled job wants: if a peer is already importing, abandon this run
 * rather than piling up behind it.
 *
 * The lock belongs to the *session* that took it, so acquire and release have
 * to run on the same physical connection. Going through the pooled
 * `DataSource.query()` would happily unlock on a different connection: the
 * unlock silently fails and the original pooled connection keeps holding the
 * lock forever, wedging every later run. Hence the dedicated QueryRunner.
 */
@Injectable()
export class PostgresSyncLock implements SyncLock {
  private readonly logger = new Logger(PostgresSyncLock.name);
  private readonly held = new Map<number, QueryRunner>();

  constructor(private readonly dataSource: DataSource) {}

  async tryAcquire(key: number): Promise<boolean> {
    if (this.held.has(key)) return false;

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    try {
      const rows = (await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [key],
      )) as { locked: boolean }[];
      if (rows[0]?.locked === true) {
        this.held.set(key, runner);
        return true;
      }
    } catch (e) {
      await runner.release();
      throw e;
    }

    await runner.release();
    return false;
  }

  async release(key: number): Promise<void> {
    const runner = this.held.get(key);
    if (!runner) return;
    this.held.delete(key);

    try {
      await runner.query('SELECT pg_advisory_unlock($1)', [key]);
    } catch (e) {
      // Never let a failed unlock mask the outcome of the run itself; releasing
      // the connection below ends the session and drops the lock regardless.
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.error(`Failed to release advisory lock ${key}: ${reason}`);
    } finally {
      await runner.release();
    }
  }
}
