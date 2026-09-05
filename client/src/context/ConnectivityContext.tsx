import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Connectivity indicator (Design.md: "always visible, since offline
// operation is core to the product"). navigator.onLine is a reasonable
// signal for the dashboard app; the offline field PWA (Phase 2) additionally
// probes the API periodically since the browser event alone is unreliable
// on some networks (Tech.md).
const ConnectivityContext = createContext<boolean>(true);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return <ConnectivityContext.Provider value={online}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): boolean {
  return useContext(ConnectivityContext);
}
