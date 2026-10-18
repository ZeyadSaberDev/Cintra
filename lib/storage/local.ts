import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/sqlite.js';

export const LOCAL_MAX_FILE_SIZE_BYTES = 50_000_000;
const localUrlPrefix = 'local://';

function filesDirectory(): string {
  return path.resolve(process.env.LOCAL_DATA_DIR?.trim() || 'data', 'files');
}

function localFileId(reference: string): string | null {
  if (!reference.startsWith(localUrlPrefix)) return null;
  const id = reference.slice(localUrlPrefix.length);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid local file reference.');
  return id;
}

export function localStorageId(reference: string): string | null {
  return localFileId(reference);
}

export async function uploadLocalFile(
  objectName: string,
  contents: Buffer,
  contentType: string,
  ownerId: string,
): Promise<string> {
  if (contents.byteLength > LOCAL_MAX_FILE_SIZE_BYTES) throw new RangeError('Local file exceeds the maximum allowed size.');
  const directory = filesDirectory();
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const safeName = path.basename(objectName).slice(0, 255) || id;
  const target = path.join(directory, id);
  await writeFile(target, contents, { flag: 'wx', mode: 0o600 });
  try {
    getDatabase().prepare(`
      INSERT INTO local_files (file_id, owner_id, file_name, content_type, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, safeName, contentType, contents.byteLength, new Date().toISOString());
  } catch (error) {
    await unlink(target).catch((cleanupError: unknown) => {
      console.error(`Could not remove incomplete local upload ${id}:`, cleanupError);
    });
    throw error;
  }
  return `${localUrlPrefix}${id}`;
}

export async function downloadLocalFile(
  reference: string,
): Promise<{ contents: Buffer; contentType: string; fileName: string } | null> {
  const id = localFileId(reference);
  if (!id) return null;
  const metadata = getDatabase().prepare(`
    SELECT content_type AS contentType, file_name AS fileName
    FROM local_files WHERE file_id = ?
  `).get(id) as { contentType: string; fileName: string } | undefined;
  if (!metadata) return null;
  try {
    const contents = await readFile(path.join(filesDirectory(), id));
    return { contents, contentType: metadata.contentType, fileName: metadata.fileName };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function deleteLocalFile(reference: string): Promise<boolean> {
  const id = localFileId(reference);
  if (!id) return false;
  const database = getDatabase();
  const metadata = database.prepare('SELECT file_id FROM local_files WHERE file_id = ?').get(id);
  if (!metadata) return false;
  try {
    await unlink(path.join(filesDirectory(), id));
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  database.prepare('DELETE FROM local_files WHERE file_id = ?').run(id);
  return true;
}

export async function deleteLocalFilesForOwner(ownerId: string): Promise<void> {
  const rows = getDatabase().prepare('SELECT file_id FROM local_files WHERE owner_id = ?')
    .all(ownerId) as Array<{ file_id: string }>;
  for (const row of rows) {
    if (!await deleteLocalFile(`${localUrlPrefix}${row.file_id}`)) {
      throw new Error(`Could not delete local file ${row.file_id} owned by the account.`);
    }
  }
}

export async function localStorageUsageBytes(): Promise<number> {
  const result = getDatabase().prepare('SELECT COALESCE(SUM(size), 0) AS size FROM local_files')
    .get() as { size: number };
  return Number(result.size) || 0;
}
