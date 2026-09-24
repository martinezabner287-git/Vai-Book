import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

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
