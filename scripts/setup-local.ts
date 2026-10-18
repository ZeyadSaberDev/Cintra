import 'dotenv/config';
import { initLocalDatabase, closeLocalDatabase } from '../lib/db/sqlite.js';

try {
  await initLocalDatabase();
  console.info(`Cintra local database is ready at ${process.env.LOCAL_DB_PATH?.trim() || `${process.env.LOCAL_DATA_DIR?.trim() || 'data'}/cintra.sqlite`}.`);
} finally {
  closeLocalDatabase();
}
