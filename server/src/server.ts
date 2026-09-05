import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { setIO } from './realtime/io';

async function main() {
  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Real-time layer (Tech.md): Socket.IO for logged-in dashboard sessions.
  // Full event wiring (requirement/dispatch/delivery push) lands in Phase 9
  // per Implementation.md; the server is stood up now so later phases only
  // add emitters, not infrastructure.
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });
  setIO(io);

  io.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log(`[socket] client connected ${socket.id}`);
    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log(`[socket] client disconnected ${socket.id}`);
    });
  });

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] DRMS API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
