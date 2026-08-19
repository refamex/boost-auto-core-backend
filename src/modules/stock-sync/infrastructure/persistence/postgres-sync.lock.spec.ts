import { DataSource } from 'typeorm';
import { PostgresSyncLock } from './postgres-sync.lock';

const KEY = 42;

describe('PostgresSyncLock', () => {
  const makeRunner = (locked: boolean) => ({
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([{ locked }]),
    release: jest.fn().mockResolvedValue(undefined),
  });

  const makeDataSource = (runners: ReturnType<typeof makeRunner>[]) =>
    ({
      createQueryRunner: jest.fn(() => runners.shift()),
    }) as unknown as DataSource;

  it('acquires the lock on a dedicated connection', async () => {
    const runner = makeRunner(true);
    const lock = new PostgresSyncLock(makeDataSource([runner]));

    await expect(lock.tryAcquire(KEY)).resolves.toBe(true);
    expect(runner.connect).toHaveBeenCalled();
    expect(runner.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [KEY],
    );
    // Still held, so the connection must not go back to the pool yet.
    expect(runner.release).not.toHaveBeenCalled();
  });

  it('releases the connection immediately when the lock is already taken', async () => {
    const runner = makeRunner(false);
    const lock = new PostgresSyncLock(makeDataSource([runner]));

    await expect(lock.tryAcquire(KEY)).resolves.toBe(false);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('unlocks on the very connection that took the lock', async () => {
    const holder = makeRunner(true);
    const other = makeRunner(true);
    const lock = new PostgresSyncLock(makeDataSource([holder, other]));

    await lock.tryAcquire(KEY);
    await lock.release(KEY);

    expect(holder.query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [KEY],
    );
    expect(holder.release).toHaveBeenCalledTimes(1);
    expect(other.query).not.toHaveBeenCalled();
  });

  it('returns the connection to the pool even if the unlock statement fails', async () => {
    const runner = makeRunner(true);
    const lock = new PostgresSyncLock(makeDataSource([runner]));
    await lock.tryAcquire(KEY);
    runner.query.mockRejectedValueOnce(new Error('connection reset'));

    await expect(lock.release(KEY)).resolves.toBeUndefined();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('ignores a release for a lock it does not hold', async () => {
    const lock = new PostgresSyncLock(makeDataSource([]));
    await expect(lock.release(KEY)).resolves.toBeUndefined();
  });

  it('can re-acquire after releasing', async () => {
    const first = makeRunner(true);
    const second = makeRunner(true);
    const lock = new PostgresSyncLock(makeDataSource([first, second]));

    await lock.tryAcquire(KEY);
    await lock.release(KEY);

    await expect(lock.tryAcquire(KEY)).resolves.toBe(true);
    expect(second.connect).toHaveBeenCalled();
  });
});
