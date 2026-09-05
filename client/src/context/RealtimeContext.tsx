import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/client';

// Phase 9's real-time layer (Tech.md): a single Socket.IO connection per
// logged-in dashboard session, listening for the 'audit-event' broadcast
// every audited mutation emits server-side (middleware/auditLog.ts) — so
// "Dashboard updates live without manual refresh" (Modules.md module 9)
// without every module having to open its own connection.
export interface RealtimeEvent {
  action: string;
  targetType: string;
  targetId: string | null;
  actorRole: string;
  timestamp: string;
}

interface RealtimeState {
  connected: boolean;
  lastEvent: RealtimeEvent | null;
  unseenCount: number;
  clearUnseen: () => void;
}

const RealtimeContext = createContext<RealtimeState>({
  connected: false,
  lastEvent: null,
  unseenCount: 0,
  clearUnseen: () => {},
});

// The API base is typically '/api' (proxied) — Socket.IO needs the bare
// origin, so strip a trailing '/api' if present rather than assuming a
// separate env var just for this.
function socketOrigin(): string {
  if (API_BASE_URL.startsWith('http')) return API_BASE_URL.replace(/\/api\/?$/, '');
  return window.location.origin;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(socketOrigin(), { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('audit-event', (event: RealtimeEvent) => {
      setLastEvent(event);
      setUnseenCount((c) => c + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ connected, lastEvent, unseenCount, clearUnseen: () => setUnseenCount(0) }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}
