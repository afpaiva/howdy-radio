import { vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

// The Vitest jsdom environment (see vitest.config.ts, `environment: 'jsdom'`)
// already provides a fully functional `window` + `document`. Do NOT replace
// them with a *separate* JSDOM instance here: doing so yields a document that
// React Testing Library renders into but that `screen` queries against the
// environment's own document — which is why every render assert returned an
// empty `<body />`. Keep the rest of the small surface-area mocks below.


// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    href: 'http://localhost',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
    origin: 'http://localhost',
  },
});

Object.defineProperty(window, 'history', {
  writable: true,
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
});

Object.defineProperty(window, 'alert', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window, 'confirm', {
  writable: true,
  value: vi.fn(() => true),
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  })),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
});

// Cleanup after each test
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});
