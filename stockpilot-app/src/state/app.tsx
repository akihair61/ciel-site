import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { initBilling } from '@/billing/purchases';
import { getSetting, setSetting } from '@/db/repo';
import { deviceLocale, isLocale, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { INDUSTRIES, type IndustryProfile } from '@/lib/industries';
import { PLANS, monthKey, type Plan, type PlanId } from '@/lib/plans';
import type { IndustryId } from '@/lib/types';

interface AppState {
  ready: boolean;
  onboarded: boolean;
  locale: Locale;
  shopName: string;
  industry: IndustryProfile;
  plan: Plan;
  deviceId: string;
  aiUsed: number;
  /** Bumped after every stock change so screens re-query. */
  version: number;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => Promise<void>;
  setShopName: (n: string) => Promise<void>;
  setIndustry: (i: IndustryId) => Promise<void>;
  completeOnboarding: (i: IndustryId) => Promise<void>;
  noteAiUse: () => Promise<void>;
  setPlan: (p: PlanId) => Promise<void>;
  bump: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());
  const [shopName, setShopNameState] = useState('');
  const [industryId, setIndustryId] = useState<IndustryId>('other');
  const [planId, setPlanId] = useState<PlanId>('free');
  const [deviceId, setDeviceId] = useState('');
  const [aiUsed, setAiUsed] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    (async () => {
      const [loc, shop, ind, plan, dev, usage] = await Promise.all([
        getSetting(db, 'locale'),
        getSetting(db, 'shopName'),
        getSetting(db, 'industry'),
        getSetting(db, 'plan'),
        getSetting(db, 'deviceId'),
        getSetting(db, `aiUsage:${monthKey(new Date())}`),
      ]);
      if (isLocale(loc)) setLocaleState(loc);
      setShopNameState(shop ?? '');
      if (ind && ind in INDUSTRIES) {
        setIndustryId(ind as IndustryId);
        setOnboarded(true);
      }
      if (plan && plan in PLANS) setPlanId(plan as PlanId);
      let id = dev;
      if (!id) {
        id = randomUUID();
        await setSetting(db, 'deviceId', id);
      }
      setDeviceId(id);
      // Subscriptions: RevenueCat is the source of truth for the plan.
      initBilling(id, (p) => {
        setPlanId(p);
        setSetting(db, 'plan', p);
      });
      setAiUsed(Number(usage ?? 0));
      setReady(true);
    })();
  }, [db]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value: AppState = {
    ready,
    onboarded,
    locale,
    shopName,
    industry: INDUSTRIES[industryId],
    plan: PLANS[planId],
    deviceId,
    aiUsed,
    version,
    t,
    setLocale: async (l) => {
      setLocaleState(l);
      await setSetting(db, 'locale', l);
    },
    setShopName: async (n) => {
      setShopNameState(n);
      await setSetting(db, 'shopName', n);
    },
    setIndustry: async (i) => {
      setIndustryId(i);
      await setSetting(db, 'industry', i);
    },
    completeOnboarding: async (i) => {
      await setSetting(db, 'industry', i);
      setIndustryId(i);
      setOnboarded(true);
    },
    noteAiUse: async () => {
      const next = aiUsed + 1;
      setAiUsed(next);
      await setSetting(db, `aiUsage:${monthKey(new Date())}`, String(next));
    },
    setPlan: async (p) => {
      setPlanId(p);
      await setSetting(db, 'plan', p);
    },
    bump: () => setVersion((v) => v + 1),
  };

  return <AppContext value={value}>{children}</AppContext>;
}

export function useApp(): AppState {
  const ctx = use(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
