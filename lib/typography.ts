export const typographyFonts = [
  'bayan',
  'system',
  'cairo',
  'ibm-plex-sans-arabic',
  'readex-pro',
  'inter',
  'noto-sans-arabic',
] as const;

export type TypographyFont = typeof typographyFonts[number];

export type TypographyPreferences = {
  font: TypographyFont;
  size: number;
  bold: boolean;
};

export const defaultTypographyPreferences: TypographyPreferences = {
  font: 'bayan',
  size: 16,
  bold: false,
};

const typographyStorageKey = 'bayan_typography';
const systemFontStack = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function isTypographyFont(value: string): value is TypographyFont {
  return typographyFonts.some((font) => font === value);
}

export function readTypographyPreferences(): TypographyPreferences {
  try {
    const stored = localStorage.getItem(typographyStorageKey);
    if (!stored) return defaultTypographyPreferences;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return defaultTypographyPreferences;

    const value = parsed as Record<string, unknown>;
    return {
      font: typeof value.font === 'string' && isTypographyFont(value.font)
        ? value.font
        : defaultTypographyPreferences.font,
      size: typeof value.size === 'number' && Number.isFinite(value.size)
        ? Math.min(24, Math.max(14, Math.round(value.size)))
        : defaultTypographyPreferences.size,
      bold: typeof value.bold === 'boolean' ? value.bold : defaultTypographyPreferences.bold,
    };
  } catch (error) {
    console.error('Could not read saved typography preferences:', error);
    return defaultTypographyPreferences;
  }
}

export function applyTypographyPreferences(preferences: TypographyPreferences): void {
  const root = document.documentElement;
  if (preferences.font === 'bayan') {
    root.style.setProperty('--font-sans-en', "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
    root.style.setProperty('--font-arabic-body', "'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif");
    root.style.setProperty('--font-arabic-heading', "'Readex Pro', 'IBM Plex Sans Arabic', sans-serif");
  } else {
    const selectedFont = preferences.font === 'system'
      ? systemFontStack
      : ({
          cairo: "'Cairo', sans-serif",
          'ibm-plex-sans-arabic': "'IBM Plex Sans Arabic', sans-serif",
          'readex-pro': "'Readex Pro', sans-serif",
          inter: "'Inter', sans-serif",
          'noto-sans-arabic': "'Noto Sans Arabic', sans-serif",
        } satisfies Record<Exclude<TypographyFont, 'bayan' | 'system'>, string>)[preferences.font];
    root.style.setProperty('--font-sans-en', selectedFont);
    root.style.setProperty('--font-arabic-body', selectedFont);
    root.style.setProperty('--font-arabic-heading', selectedFont);
  }
  root.style.setProperty('--bayan-base-font-size', `${preferences.size}px`);
  root.dataset.bayanBoldText = String(preferences.bold);
}

export function saveTypographyPreferences(preferences: TypographyPreferences): void {
  localStorage.setItem(typographyStorageKey, JSON.stringify(preferences));
  applyTypographyPreferences(preferences);
}
