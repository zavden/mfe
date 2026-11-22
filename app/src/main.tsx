import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/styles.css';
import { applyTheme, readStoredTheme, resolveTheme } from './ui/theme';

if (import.meta.env.DEV) void import('./devtools').then((m) => m.installDevtools());

// Apply the stored theme before the first render to avoid a flash of the wrong theme.
applyTheme(resolveTheme(readStoredTheme()));

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
