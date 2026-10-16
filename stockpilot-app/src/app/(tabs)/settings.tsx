import * as Haptics from 'expo-haptics';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, Heading, Muted, Screen } from '@/components/ui';
import { getForecasts } from '@/db/repo';
import { toCsv } from '@/lib/csv';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LOCALES, LOCALE_NAMES, formatNumber } from '@/lib/i18n';
import { INDUSTRY_IDS } from '@/lib/industries';
import { PLANS } from '@/lib/plans';
import { useApp } from '@/state/app';

function Chips<T extends string>({ options, value, label, onChange }: { options: readonly T[]; value: T; label: (v: T) => string; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(o);
            }}
            style={[styles.chip, { backgroundColor: active ? theme.accent : theme.backgroundSelected }]}>
            <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '600' }}>{label(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Settings() {
  const db = useSQLiteContext();
  const app = useApp();
  const { t } = app;
  const theme = useTheme();

  const exportCsv = async () => {
    try {
      const rows = await getForecasts(db, app.industry);
      const csv = toCsv([
        ['name', 'variant', 'sku', 'barcode', 'category', 'quantity', 'unit', 'daily_usage', 'days_left', 'suggested_order', 'unit_cost', 'supplier'],
        ...rows.map(({ item, forecast }) => [
          item.name, item.variant, item.sku, item.barcode, item.category, item.quantity, item.unit,
          Math.round(forecast.dailyUsage * 100) / 100,
          forecast.daysLeft === null ? '' : Math.round(forecast.daysLeft),
          forecast.suggestedOrder, item.unitCost, item.supplier,
        ]),
      ]);
      const file = new File(Paths.cache, `stockpilot-${new Date().toISOString().slice(0, 10)}.csv`);
      if (file.exists) file.delete();
      file.create();
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch {
      Alert.alert(t('common.error'));
    }
  };

  return (
    <Screen title={t('settings.title')}>
      <Card index={0}>
        <Field label={t('settings.shop')} defaultValue={app.shopName} onEndEditing={(e) => app.setShopName(e.nativeEvent.text.trim())} />
      </Card>

      <Card index={1}>
        <Heading>{t('settings.language')}</Heading>
        <Chips options={LOCALES} value={app.locale} label={(l) => LOCALE_NAMES[l]} onChange={app.setLocale} />
      </Card>

      <Card index={2}>
        <Heading>{t('settings.industry')}</Heading>
        <Chips options={INDUSTRY_IDS} value={app.industry.id} label={(i) => t(`industry.${i}`)} onChange={app.setIndustry} />
      </Card>

      <Card index={3}>
        <Heading>{t('settings.plan')}</Heading>
        <Muted>{t('settings.aiUsage', { used: app.aiUsed, limit: app.plan.aiActionsPerMonth })}</Muted>
        {Object.values(PLANS).map((p) => (
          <View
            key={p.id}
            style={[styles.plan, { borderColor: p.id === app.plan.id ? theme.accent : theme.border }]}>
            <Text style={[styles.planName, { color: theme.text }]}>{t(`plan.${p.id}`)}</Text>
            <Muted>
              {t('plan.price', { n: p.priceUsd })} · {Number.isFinite(p.maxItems) ? t('plan.items', { n: p.maxItems }) : t('plan.unlimited')} ·{' '}
              {t('plan.ai', { n: formatNumber(app.locale, p.aiActionsPerMonth, 0) })}
            </Muted>
          </View>
        ))}
        {app.plan.id !== 'business' ? (
          <Button label={t('paywall.upgrade')} icon="ai" onPress={() => router.push('/paywall')} />
        ) : null}
      </Card>

      <Card index={4}>
        <Heading>{t('settings.data')}</Heading>
        <Button label={t('settings.export')} variant="secondary" icon="send" onPress={exportCsv} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill },
  plan: { borderWidth: 2, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  planName: { fontSize: 17, fontWeight: '800' },
});
