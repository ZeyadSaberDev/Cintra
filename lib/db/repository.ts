import { createHash } from 'node:crypto';
import { DATA_COLLECTIONS, type DataCollection } from './collections.js';
import { getDatabase } from './sqlite.js';

export type DataFilter = {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
  value: unknown;
};
export type DataOrder = { field: string; direction?: 'asc' | 'desc' };
export type DataListOptions = {
  filters?: DataFilter[];
  orderBy?: DataOrder[];
  limit?: number;
  offset?: number;
  startAfter?: string;
  startAtValues?: unknown[];
};

export type DataDocument = Record<string, unknown> & { id: string };

function documentId(id: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(id) && !id.startsWith('$')) return id;
  return `k${createHash('sha256').update(id).digest('hex').slice(0, 34)}`;
}

function compareValues(actual: unknown, expected: unknown): number {
  if (actual === undefined || actual === null) return -1;
  if (typeof actual === 'number' && typeof expected === 'number') return actual - expected;
  return String(actual).localeCompare(String(expected), undefined, { numeric: true });
}

function matches(row: DataDocument, filter: DataFilter): boolean {
  const actual = filter.field === 'id' ? row.id : row[filter.field];
  const expected = filter.value;
  switch (filter.op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'array-contains': return Array.isArray(actual) && actual.includes(expected);
    case '>': return compareValues(actual, expected) > 0;
    case '>=': return compareValues(actual, expected) >= 0;
    case '<': return compareValues(actual, expected) < 0;
    case '<=': return compareValues(actual, expected) <= 0;
  }
}

function sortRows(rows: DataDocument[], orders: DataOrder[]): DataDocument[] {
  return rows.sort((left, right) => {
    for (const order of orders) {
      const a = order.field === 'id' ? left.id : left[order.field];
      const b = order.field === 'id' ? right.id : right[order.field];
      const compare = a instanceof Date && b instanceof Date
        ? a.getTime() - b.getTime()
        : compareValues(a, b);
      if (compare) return order.direction === 'desc' ? -compare : compare;
    }
    return 0;
  });
}

function rowValue(payload: unknown): DataDocument {
  if (typeof payload !== 'string') throw new Error('Local database record payload is invalid.');
  const parsed: unknown = JSON.parse(payload);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof (parsed as { id?: unknown }).id !== 'string') {
    throw new Error('Local database record payload is invalid.');
  }
  return parsed as DataDocument;
}

export class LocalDatabaseError extends Error {
  constructor(message: string, public readonly code: number | string) {
    super(message);
    this.name = 'LocalDatabaseError';
  }
}

export class LocalRepository<T extends DataDocument = DataDocument> {
  private readonly collectionId: string;

  constructor(collection: DataCollection) {
    const id = DATA_COLLECTIONS[collection];
    if (!id) throw new Error(`Unknown local data collection: ${String(collection)}.`);
    this.collectionId = id;
  }

  async get(id: string): Promise<T | null> {
    const row = getDatabase().prepare('SELECT payload FROM records WHERE collection = ? AND id = ?')
      .get(this.collectionId, documentId(id)) as { payload: string } | undefined;
    return row ? rowValue(row.payload) as T : null;
  }

  async list(options: DataListOptions = {}): Promise<T[]> {
    if (options.offset !== undefined && (!Number.isInteger(options.offset) || options.offset < 0)) {
      throw new RangeError('Query offset must be a non-negative integer.');
    }
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100_000)) {
      throw new RangeError('Query limit must be an integer between 1 and 100000.');
    }

    const rows = getDatabase().prepare('SELECT payload FROM records WHERE collection = ?')
      .all(this.collectionId) as Array<{ payload: string }>;
    const filters = options.filters || [];
    const filtered = rows.map(({ payload }) => rowValue(payload)).filter((row) => filters.every((filter) => matches(row, filter)));
    const sorted = options.orderBy?.length ? sortRows(filtered, options.orderBy) : filtered;
    const cursorIndex = options.startAfter
      ? sorted.findIndex((row) => row.id === options.startAfter)
      : -1;
    let cursorRows = cursorIndex >= 0 ? sorted.slice(cursorIndex + 1) : sorted;
    if (options.startAtValues?.length && options.orderBy?.length) {
      const [firstValue, secondValue] = options.startAtValues;
      cursorRows = cursorRows.filter((row) => {
        for (const [index, order] of options.orderBy!.entries()) {
          const target = index === 0 ? firstValue : secondValue;
          if (target === undefined) break;
          const actual = order.field === 'id' ? row.id : row[order.field];
          const compare = compareValues(actual, target);
          if (compare) return order.direction === 'desc' ? compare <= 0 : compare >= 0;
        }
        return true;
      });
    }
    const offset = options.offset || 0;
    return cursorRows.slice(offset, options.limit === undefined ? undefined : offset + options.limit) as T[];
  }

  async create(id: string, value: Omit<T, 'id'>): Promise<T> {
    const key = documentId(id);
    try {
      getDatabase().prepare('INSERT INTO records (collection, id, payload) VALUES (?, ?, ?)')
        .run(this.collectionId, key, JSON.stringify({ ...value, id }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new LocalDatabaseError(`Local database record ${id} already exists.`, 409);
      }
      throw error;
    }
    return { id, ...value } as T;
  }

  async set(id: string, value: Partial<Omit<T, 'id'>>, merge = true): Promise<void> {
    const existing = merge ? await this.get(id) : null;
    const payload = JSON.stringify({ ...(existing || {}), ...value, id });
    getDatabase().prepare(`
      INSERT INTO records (collection, id, payload) VALUES (?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload
    `).run(this.collectionId, documentId(id), payload);
  }

  async update(id: string, value: Partial<Omit<T, 'id'>>): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    const payload = JSON.stringify({ ...existing, ...value, id });
    const result = getDatabase().prepare('UPDATE records SET payload = ? WHERE collection = ? AND id = ?')
      .run(payload, this.collectionId, documentId(id));
    return Number(result.changes) > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = getDatabase().prepare('DELETE FROM records WHERE collection = ? AND id = ?')
      .run(this.collectionId, documentId(id));
    return Number(result.changes) > 0;
  }

  async increment(id: string, fields: Record<string, number>, otherFields: Record<string, unknown> = {}): Promise<void> {
    await runLocalTransaction(async (transaction) => {
      const existing = await transaction.get(this.collectionId, id);
      const changes: Record<string, unknown> = { ...otherFields };
      for (const [field, amount] of Object.entries(fields)) {
        changes[field] = Number(existing?.[field] || 0) + amount;
      }
      if (existing) await transaction.update(this.collectionId, id, changes);
      else await transaction.create(this.collectionId, id, changes);
    });
  }

  async count(options: DataListOptions = {}): Promise<number> {
    return (await this.list({ filters: options.filters })).length;
  }
}

export interface LocalTransaction {
  get<T extends DataDocument = DataDocument>(collection: string, id: string): Promise<T | null>;
  list<T extends DataDocument = DataDocument>(collection: string, options?: DataListOptions): Promise<T[]>;
  create(collection: string, id: string, value: Record<string, unknown>): Promise<void>;
  update(collection: string, id: string, value: Record<string, unknown>): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
}

let transactionSequence = 0;
let transactionDepth = 0;

export async function runLocalTransaction<T>(callback: (transaction: LocalTransaction) => Promise<T>): Promise<T> {
  const database = getDatabase();
  const nested = transactionDepth > 0;
  const savepoint = `cintra_nested_${++transactionSequence}`;
  database.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  transactionDepth++;
  const repositoryFor = (collection: string) => {
    const key = Object.keys(DATA_COLLECTIONS).find((item) =>
      DATA_COLLECTIONS[item as DataCollection] === collection) as DataCollection | undefined;
    if (!key) throw new Error(`Unknown local data collection: ${collection}.`);
    return new LocalRepository(key);
  };
  const transaction: LocalTransaction = {
    get: async <R extends DataDocument = DataDocument>(collection: string, id: string) =>
      await repositoryFor(collection).get(id) as R | null,
    list: async <R extends DataDocument = DataDocument>(collection: string, options: DataListOptions = {}) =>
      await repositoryFor(collection).list(options) as R[],
    create: async (collection, id, value) => { await repositoryFor(collection).create(id, value); },
    update: async (collection, id, value) => {
      if (!await repositoryFor(collection).update(id, value)) throw new Error(`Local database record ${id} is missing.`);
    },
    delete: async (collection, id) => { await repositoryFor(collection).delete(id); },
  };
  try {
    const result = await callback(transaction);
    database.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
    return result;
  } catch (error) {
    if (nested) {
      database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      database.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } else {
      database.exec('ROLLBACK');
    }
    throw error;
  } finally {
    transactionDepth--;
  }
}

export function collectionForId(collectionId: string): DataCollection | null {
  return (Object.keys(DATA_COLLECTIONS) as DataCollection[])
    .find((key) => DATA_COLLECTIONS[key] === collectionId) || null;
}

export function localDocumentId(value: string): string {
  return documentId(value);
}
