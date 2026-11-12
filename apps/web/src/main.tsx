import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider, PrefsProvider } from './lib/auth';
import './styles/tokens.css';
import './styles/app.css';

// Register the service worker so the app is installable and opens instantly. Only in a production
// build: a SW in dev would cache the dev server's modules and serve stale code on every reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability degrades gracefully; the app itself works fine without a worker.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PrefsProvider>
          <App />
        </PrefsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
