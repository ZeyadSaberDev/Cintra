import 'dotenv/config';
import { createServer } from 'vite';
import app, { PORT } from './server.js';

async function startDevelopmentServer() {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cintra full-stack server running on port ${PORT}`);
  });
}

void startDevelopmentServer();