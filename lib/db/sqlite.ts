import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let database: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (database) return database;

  const dataDirectory = path.resolve(process.env.LOCAL_DATA_DIR?.trim() || 'data');
  mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.resolve(process.env.LOCAL_DB_PATH?.trim() || path.join(dataDirectory, 'cintra.sqlite'));
  mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL CHECK (json_valid(payload)),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_collection ON records (collection);
    CREATE TABLE IF NOT EXISTS auth_accounts (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      email_verified INTEGER NOT NULL DEFAULT 1,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_accounts(user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expiration ON auth_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_accounts(user_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS server_counters (
      row_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL CHECK (json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS local_files (
      file_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS local_files_owner ON local_files (owner_id);
  `);
  return database;
}

export async function initLocalDatabase(): Promise<void> {
  getDatabase();
}

export function closeLocalDatabase(): void {
  database?.close();
  database = null;
}
