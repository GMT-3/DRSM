import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest doesn't expose a global `afterEach` unless `test.globals: true` is
// set (deliberately left off so test-only globals don't leak into app code
// type-checking), so @testing-library/react's usual auto-cleanup hook never
// fires. Without this, elements from one test stick around in jsdom for the
// next test in the same file — which is exactly what caused three
// cross-test-contamination failures in Login.test.tsx / ProtectedRoute.test.tsx
// (queries were matching leftover nodes from a previous test, not the
// current render). Registering cleanup here, once, fixes all of them.
afterEach(() => {
  cleanup();
});
