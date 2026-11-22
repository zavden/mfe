/* The colour theme: dark or light, or the system's (`prefers-color-scheme`, followed as it
 * changes). The choice is kept in the browser; `data-theme` on the root carries the theme the
 * stylesheets read. */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { safeStorage } from './storage';

export type Theme = 'dark' | 'light';
/** What the user chose: a theme, or the system's. */
export type ThemeChoice = Theme | 'system';

export const THEME_STORAGE_KEY = 'mfe.theme';
export const DEFAULT_THEME: Theme = 'dark';
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function readStoredTheme(): ThemeChoice {
  const value = safeStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
}

const systemQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SYSTEM_DARK_QUERY)
    : null;

/** The system's theme; the default where the browser cannot say (a test DOM). */
export function systemTheme(): Theme {
  const query = systemQuery();
  if (!query) return DEFAULT_THEME;
  return query.matches ? 'dark' : 'light';
}

/** The theme a choice means right now. */
export function resolveTheme(choice: ThemeChoice): Theme {
  return choice === 'system' ? systemTheme() : choice;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function subscribeSystem(onChange: () => void): () => void {
  const query = systemQuery();
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export interface ThemeControl {
  /** The theme in effect. */
  theme: Theme;
  choice: ThemeChoice;
  setTheme(choice: ThemeChoice): void;
  /** Dark ↔ light from the theme in effect: a choice of its own, no longer the system's. */
  toggleTheme(): void;
}

export function useTheme(): ThemeControl {
  const [choice, setChoice] = useState<ThemeChoice>(readStoredTheme);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => DEFAULT_THEME);
  const theme: Theme = choice === 'system' ? system : choice;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    safeStorage.setItem(THEME_STORAGE_KEY, next);
    setChoice(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return { theme, choice, setTheme, toggleTheme };
}
