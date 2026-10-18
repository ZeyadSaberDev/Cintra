type CachedSetting = { value: string; expiresAt: number; stale: boolean };

const settings = new Map<string, CachedSetting>();
const SETTINGS_CACHE_MS = 10_000;

export function isTransientAdminSettingReadError(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<object>();
  for (let depth = 0; depth < 3 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current);
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    const code = String(candidate.code ?? '').toLowerCase();
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
    const status = Number(candidate.code);
    if ([408, 425, 429, 500, 502, 503, 504].includes(status)
      || code === 'econnreset'
      || code === 'etimedout'
      || code === 'unavailable'
      || message.includes('timeout')
      || message.includes('temporarily unavailable')) return true;
    current = candidate.cause;
  }
  return false;
}

export async function guestLoginAllowed(readSetting: () => Promise<string>): Promise<boolean> {
  return await readSetting() === 'true';
}

export async function cachedAdminSetting(
  key: string,
  load: () => Promise<string>,
): Promise<string> {
  const cached = settings.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const value = await load();
    settings.set(key, { value, expiresAt: Date.now() + SETTINGS_CACHE_MS, stale: false });
    return value;
  } catch (error) {
    if (!cached || !isTransientAdminSettingReadError(error)) throw error;
    settings.set(key, { ...cached, expiresAt: Date.now() + SETTINGS_CACHE_MS, stale: true });
    console.warn(`Could not refresh admin setting "${key}" due to a temporary database error; using its last known value.`);
    return cached.value;
  }
}

export async function cachedAdminSettingStrict(
  key: string,
  load: () => Promise<string>,
): Promise<string> {
  const cached = settings.get(key);
  if (cached && !cached.stale && cached.expiresAt > Date.now()) return cached.value;
  const value = await load();
  settings.set(key, { value, expiresAt: Date.now() + SETTINGS_CACHE_MS, stale: false });
  return value;
}

export function invalidateAdminSetting(key: string): void {
  settings.delete(key);
}
