import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';
import { applyTypographyPreferences, readTypographyPreferences } from '../lib/typography';
import { AlertProvider } from './contexts/AlertContext';
import { applyThemePreference, readThemePreference } from './lib/theme';

applyTypographyPreferences(readTypographyPreferences());
applyThemePreference(readThemePreference());
createRoot(document.getElementById('root')!).render(
  <AlertProvider>
    <App />
  </AlertProvider>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js')
      .catch((error: unknown) => console.error('PWA service worker registration failed:', error));
  }, { once: true });
}
