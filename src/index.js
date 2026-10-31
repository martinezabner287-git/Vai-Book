import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary, { reportClientError } from './AppErrorBoundary';
import { ThemeProvider } from './ThemeContext';
import './i18n';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
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
