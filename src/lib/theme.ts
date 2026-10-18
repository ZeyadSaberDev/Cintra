export type ThemePreference = 'light' | 'dark' | 'auto';

const THEME_STORAGE_KEY = 'bayan_theme';

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto';
}

export function readThemePreference(fallback: ThemePreference = 'light'): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : fallback;
}

export function isDarkTheme(preference: ThemePreference): boolean {
  return preference === 'dark'
    || (preference === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function applyThemePreference(preference: ThemePreference): void {
  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = preference === 'auto'
    ? ''
    : preference;
}

export function saveThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyThemePreference(preference);
}
