import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { FirebaseProvider, FirestoreErrorBoundary } from './lib/firebase';
import './index.css';

// Google Maps Platform Case A Quota & Auth Defense Listeners (registered before React render)
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-auth-failure'));
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  if (
    msg.includes('InvalidKeyMapError') ||
    msg.includes('ApiNotActivatedMapError') ||
    msg.includes('RefererNotAllowedMapError') ||
    msg.includes('ApiProjectMapError')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-auth-failure'));
  }
};

// Register Ultra-Fast PWA Service Worker
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
  });
}

createRoot(document.getElementById('root')!).render(
  <FirestoreErrorBoundary>
    <FirebaseProvider>
      <App />
    </FirebaseProvider>
  </FirestoreErrorBoundary>
);
