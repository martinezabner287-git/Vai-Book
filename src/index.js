import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary, { reportClientError } from './AppErrorBoundary';
import { ThemeProvider } from './ThemeContext';
import './i18n';

// vaibook.bz is the real address now. Old vai-book.vercel.app links, QR
// codes and posters keep working: they land here and move to the same page
// (booking link, selected services and all) on vaibook.bz.
const OLD_HOST = 'vai-book.vercel.app';
const movingToNewDomain = window.location.hostname === OLD_HOST;
if (movingToNewDomain) {
  const { pathname, search, hash } = window.location;
  window.location.replace(`https://vaibook.bz${pathname}${search}${hash}`);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
if (!movingToNewDomain) root.render(
  <AppErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </AppErrorBoundary>
);

// Errors outside of drawing a screen (a failed promise, an event handler)
// don't reach the boundary — log them too, without interrupting anyone.
window.addEventListener('error', (e) => { if (e && e.error) reportClientError(e.error); });
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  if (r && (r instanceof Error)) reportClientError(r);
});

// App-like feel on phones: no pinch-zoom or double-tap zoom on the page.
// Android follows the viewport meta tag; iPhone Safari ignores it for pinch,
// so the gesture is cancelled here. Maps keep their own pinch-to-zoom.
const inZoomableArea = (t) => !!(t && t.closest && t.closest('.leaflet-container, [data-allow-zoom]'));
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
  document.addEventListener(type, (e) => { if (!inZoomableArea(e.target)) e.preventDefault(); }, { passive: false });
});
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1 && !inZoomableArea(e.target)) e.preventDefault();
}, { passive: false });

// Registers the Web Push service worker (public/service-worker.js). This
// alone doesn't ask for notification permission or subscribe anyone to
// anything — it just makes the service worker available so the "Enable
// push notifications" button in the provider Settings tab has something
// to call navigator.serviceWorker.ready against.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
