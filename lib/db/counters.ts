import { createHash } from 'node:crypto';
import { getDatabase } from './sqlite.js';

export interface ServerCounter {
  $id: string;
  kind: string;
  userId: string;
  date: string;
  count: number;
  balance: number;
  creditsConsumed: number;
  model: string;
  createdAt: string;
  updatedAt: string;
}

function readCounter(rowId: string): ServerCounter | null {
  const row = getDatabase().prepare('SELECT payload FROM server_counters WHERE row_id = ?').get(rowId) as { payload: string } | undefined;
  return row ? { ...JSON.parse(row.payload) as Omit<ServerCounter, '$id'>, $id: rowId } : null;
}

function saveCounter(rowId: string, data: Omit<ServerCounter, '$id'>): void {
  getDatabase().prepare(`
    INSERT INTO server_counters (row_id, payload) VALUES (?, ?)
    ON CONFLICT(row_id) DO UPDATE SET payload = excluded.payload
  `).run(rowId, JSON.stringify(data));
}

export function creditCounterId(userId: string): string {
  return `credit_${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`;
}

export function usageCounterId(userId: string, date: string): string {
  const digest = createHash('sha256').update(`${userId}:${date}`).digest('hex').slice(0, 29);
  return `usage_${digest}`;
}

export async function getServerCounter(rowId: string): Promise<ServerCounter | null> {
  return readCounter(rowId);
}

export async function createServerCounter(rowId: string, data: Omit<ServerCounter, '$id'>): Promise<ServerCounter> {
  try {
    getDatabase().prepare('INSERT INTO server_counters (row_id, payload) VALUES (?, ?)').run(rowId, JSON.stringify(data));
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw Object.assign(new Error(`Local counter ${rowId} already exists.`), { code: 409 });
    }
    throw error;
  }
  return { $id: rowId, ...data };
}

export async function ensureServerCounter(rowId: string, data: Omit<ServerCounter, '$id'>): Promise<ServerCounter> {
  const existing = readCounter(rowId);
  if (existing) return existing;
  try {
    return await createServerCounter(rowId, data);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && Number((error as { code: unknown }).code) === 409)) throw error;
    const winner = readCounter(rowId);
    if (!winner) throw error;
    return winner;
  }
}

export async function updateServerCounter(rowId: string, data: Partial<ServerCounter>): Promise<ServerCounter> {
  const existing = readCounter(rowId);
  if (!existing) throw new Error(`Local counter ${rowId} is missing.`);
  const { $id: _id, ...current } = existing;
  const { $id: _updateId, ...changes } = data;
  const updated = { ...current, ...changes };
  saveCounter(rowId, updated);
  return { $id: rowId, ...updated };
}

export async function incrementServerCounter(rowId: string, column: 'count' | 'creditsConsumed', value: number): Promise<void> {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Counter increment must be a non-negative safe integer.');
  const result = getDatabase().prepare(`
    UPDATE server_counters
    SET payload = json_set(payload, '$.${column}', COALESCE(json_extract(payload, '$.${column}'), 0) + ?)
    WHERE row_id = ?
  `).run(value, rowId);
  if (!Number(result.changes)) throw new Error(`Local counter ${rowId} is missing.`);
}

export async function decrementCreditCounter(rowId: string, amount: number): Promise<void> {
  const result = getDatabase().prepare(`
    UPDATE server_counters
    SET payload = json_set(payload, '$.balance', json_extract(payload, '$.balance') - ?)
    WHERE row_id = ? AND json_extract(payload, '$.balance') >= ?
  `).run(amount, rowId, amount);
  if (!Number(result.changes)) throw Object.assign(new Error('Insufficient local credit balance.'), { code: 409 });
}

export async function setCreditCounter(rowId: string, balance: number): Promise<ServerCounter> {
  const existing = readCounter(rowId);
  if (!existing) {
    return ensureServerCounter(rowId, {
      kind: 'credit', userId: '', date: '', count: 0, balance, creditsConsumed: 0, model: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }
  return updateServerCounter(rowId, { balance, updatedAt: new Date().toISOString() });
}

export async function deleteServerCounter(rowId: string): Promise<void> {
  getDatabase().prepare('DELETE FROM server_counters WHERE row_id = ?').run(rowId);
}

export async function listServerCounters(): Promise<ServerCounter[]> {
  const rows = getDatabase().prepare('SELECT row_id, payload FROM server_counters').all() as Array<{ row_id: string; payload: string }>;
  return rows.map(({ row_id, payload }) => ({ ...JSON.parse(payload) as Omit<ServerCounter, '$id'>, $id: row_id }));
}
