import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0D12',
    textSecondary: '#5B6170',
    background: '#F4F5F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E8EE',
    border: '#E2E4EA',
    accent: '#3D5AFE',
    accentSoft: '#E7EBFF',
    onAccent: '#FFFFFF',
    danger: '#E5484D',
    warning: '#D97706',
    success: '#12A150',
    info: '#0EA5E9',
  },
  dark: {
    text: '#F3F4F7',
    textSecondary: '#9AA0AE',
    background: '#08090C',
    backgroundElement: '#15171C',
    backgroundSelected: '#22252C',
    border: '#262A32',
    accent: '#7B8CFF',
    accentSoft: '#1D2246',
    onAccent: '#0B0D12',
    danger: '#FF6369',
    warning: '#FBBF24',
    success: '#3DD68C',
    info: '#38BDF8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
