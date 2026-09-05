import { Server as SocketIOServer } from 'socket.io';

// Holds the live Socket.IO server instance so controllers/middleware can
// broadcast events without importing server.ts (which would create a
// circular import — server.ts is the entry point that imports app.ts,
// which the routes/controllers hang off). Set once at startup;
// emitEvent/emitToNotified are safe no-ops before that (e.g. during
// Jest's supertest runs, which call createApp() directly without ever
// starting a real Socket.IO server).
let io: SocketIOServer | null = null;

export function setIO(instance: SocketIOServer) {
  io = instance;
}

/**
 * Broadcasts a live update to every connected dashboard (Tech.md's
 * real-time layer, Modules.md "Dashboard updates live without manual
 * refresh"). Every audited mutation emits one of these — see
 * middleware/auditLog.ts — so any connected client can react (typically
 * by re-fetching the module it's currently viewing) without polling.
 */
export function emitEvent(event: string, payload: Record<string, unknown>) {
  io?.emit(event, payload);
}
