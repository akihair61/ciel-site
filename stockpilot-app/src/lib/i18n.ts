import { getLocales } from 'expo-localization';

import { en, type MessageKey, type Messages } from './locales/en';
import { es } from './locales/es';
import { id } from './locales/id';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { th } from './locales/th';
import { vi } from './locales/vi';
import { zh } from './locales/zh';

export type { MessageKey };

export const LOCALES = ['ja', 'en', 'th', 'zh', 'ko', 'vi', 'id', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTS: Record<Locale, Messages> = { ja, en, th, zh, ko, vi, id, es };

/** Shown in the language picker, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  th: 'ไทย',
  zh: '简体中文',
  ko: '한국어',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  es: 'Español',
};

/** BCP-47 tags for on-device speech recognition. */
export const SPEECH_LANG: Record<Locale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  th: 'th-TH',
  zh: 'zh-CN',
  ko: 'ko-KR',
  vi: 'vi-VN',
  id: 'id-ID',
  es: 'es-ES',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function deviceLocale(): Locale {
  for (const l of getLocales()) {
    if (isLocale(l.languageCode)) return l.languageCode;
  }
  return 'en';
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let text = DICTS[locale][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

export function formatNumber(locale: Locale, n: number, digits = 1): string {
  return new Intl.NumberFormat(SPEECH_LANG[locale], { maximumFractionDigits: digits }).format(n);
}

export function formatDate(locale: Locale, isoDate: string): string {
  return new Intl.DateTimeFormat(SPEECH_LANG[locale], { month: 'short', day: 'numeric' }).format(
    new Date(isoDate.length === 10 ? isoDate + 'T00:00:00' : isoDate),
  );
}
