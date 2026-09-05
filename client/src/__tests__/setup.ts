import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { JSDOM } from 'jsdom';

// Mock window.document for React Testing Library
const mockDocument = new JSDOM('', { url: 'http://localhost' }).window.document;

// Mock window and global for Vitest compatibility
Object.defineProperty(window, 'document', {
  writable: true,
  value: mockDocument,
});

Object.defineProperty(global, 'document', {
  writable: true,
  value: mockDocument,
});

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
vi.beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});
