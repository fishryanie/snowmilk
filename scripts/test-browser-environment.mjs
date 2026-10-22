// Preload before React DOM and Ant Design inspect browser capabilities at import time.
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost:3002' });
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
  Node: window.Node, SVGElement: window.SVGElement, ShadowRoot: window.ShadowRoot,
  MutationObserver: window.MutationObserver, ResizeObserver: window.ResizeObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
