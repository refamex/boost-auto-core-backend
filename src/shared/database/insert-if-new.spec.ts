import { Repository } from 'typeorm';
import { insertIfNew } from './insert-if-new';

type Entity = { id: string; key: string };

type QbMock = {
  insert: jest.Mock;
  into: jest.Mock;
  values: jest.Mock;
  orIgnore: jest.Mock;
  returning: jest.Mock;
  updateEntity: jest.Mock;
  execute: jest.Mock;
};

function repoWith(raw: unknown) {
  const execute = jest.fn().mockResolvedValue({ raw });
  const qb: QbMock = {
    insert: jest.fn(() => qb),
    into: jest.fn(() => qb),
    values: jest.fn(() => qb),
    orIgnore: jest.fn(() => qb),
    returning: jest.fn(() => qb),
    updateEntity: jest.fn(() => qb),
    execute,
  };
  const repo = {
    target: 'EntityTarget',
    metadata: { primaryColumns: [{ databaseName: 'id' }] },
    createQueryBuilder: jest.fn(() => qb),
  } as unknown as Repository<Entity>;

  return { repo, qb, execute };
}

describe('insertIfNew', () => {
  it('reports the row as new when the database returned it', async () => {
    const { repo } = repoWith([{ id: 'row-1' }]);
    await expect(insertIfNew(repo, { key: 'k' })).resolves.toBe(true);
  });

  // ON CONFLICT DO NOTHING returns zero rows instead of raising 23505: that
  // empty result is the whole point of this helper.
  it('reports a conflicting row as not new', async () => {
    const { repo } = repoWith([]);
    await expect(insertIfNew(repo, { key: 'k' })).resolves.toBe(false);
  });

  it('treats an absent raw result as not new', async () => {
    const { repo } = repoWith(undefined);
    await expect(insertIfNew(repo, { key: 'k' })).resolves.toBe(false);
  });

  it('asks the database to ignore the conflict instead of raising it', async () => {
    const { repo, qb } = repoWith([{ id: 'row-1' }]);
    await insertIfNew(repo, { key: 'k' });
    expect(qb.orIgnore).toHaveBeenCalled();
  });

  it('returns the primary column so the caller can tell insert from conflict', async () => {
    const { repo, qb } = repoWith([{ id: 'row-1' }]);
    await insertIfNew(repo, { key: 'k' });
    expect(qb.returning).toHaveBeenCalledWith(['id']);
  });

  it('passes the values through to the insert', async () => {
    const { repo, qb } = repoWith([{ id: 'row-1' }]);
    await insertIfNew(repo, { key: 'k' });
    expect(qb.values).toHaveBeenCalledWith({ key: 'k' });
  });

  // A real failure (bad column, dead connection) must still reach the caller;
  // swallowing it here would hide every write problem behind "duplicate".
  it('propagates a genuine query failure', async () => {
    const { repo, execute } = repoWith([]);
    execute.mockRejectedValue(new Error('connection terminated'));
    await expect(insertIfNew(repo, { key: 'k' })).rejects.toThrow(
      'connection terminated',
    );
  });
});
