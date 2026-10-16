import { Share, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Heading, Muted, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { ItemWithForecast } from '@/db/repo';
import { useForecasts } from '@/hooks/use-forecasts';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/i18n';
import { useApp } from '@/state/app';

export default function Orders() {
  const { t, locale, shopName } = useApp();
  const theme = useTheme();
  const rows = useForecasts();

  const bySupplier = new Map<string, ItemWithForecast[]>();
  for (const r of rows ?? []) {
    if (r.forecast.suggestedOrder <= 0) continue;
    const key = r.item.supplier ?? '';
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), r]);
  }
  const groups = [...bySupplier.entries()].sort(([a], [b]) => a.localeCompare(b));

  const send = (supplier: string, list: ItemWithForecast[]) => {
    const lines = list.map(
      ({ item, forecast }) =>
        `・${item.name}${item.variant ? ` (${item.variant})` : ''}  ${formatNumber(locale, forecast.suggestedOrder, 0)} ${item.unit}`,
    );
    const header = t('orders.message', { shop: shopName || 'StockPilot' });
    Share.share({ message: [supplier ? `${supplier}\n` : '', header, '', ...lines].join('\n') });
  };

  return (
    <Screen title={t('orders.title')}>
      {rows && groups.length === 0 ? <Muted>{t('orders.empty')}</Muted> : null}
      {groups.map(([supplier, list], i) => {
        const total = list.reduce((sum, { item, forecast }) => sum + (item.unitCost ?? 0) * forecast.suggestedOrder, 0);
        return (
          <Card key={supplier || '-'} index={i}>
            <Heading>{supplier || t('orders.noSupplier')}</Heading>
            {list.map(({ item, forecast }) => (
              <View key={item.id} style={styles.line}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                  {item.variant ? <Text style={{ color: theme.textSecondary }}>  {item.variant}</Text> : null}
                </Text>
                <Text style={[styles.qty, { color: theme.accent }]}>
                  {formatNumber(locale, forecast.suggestedOrder, 0)} {item.unit}
                </Text>
              </View>
            ))}
            {total > 0 ? <Muted>{t('orders.estimate', { amount: formatNumber(locale, total, 0) })}</Muted> : null}
            <Button label={t('orders.share')} icon="send" onPress={() => send(supplier, list)} />
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  qty: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
