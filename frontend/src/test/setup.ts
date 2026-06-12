import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mantine usa matchMedia y ResizeObserver, ausentes en jsdom.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom no implementa scrollIntoView (Mantine ScrollArea).
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// jsdom no implementa document.fonts (Mantine Textarea autosize).
if (!document.fonts) {
  Object.defineProperty(document, "fonts", {
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      ready: Promise.resolve(),
      status: "loaded",
    },
  });
}
