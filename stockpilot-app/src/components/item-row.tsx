import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { ItemWithForecast } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import type { StockStatus } from '@/lib/forecast';
import { formatNumber } from '@/lib/i18n';
import { useApp } from '@/state/app';

import { StockMeter } from './ui';

export function useStatusColor() {
  const theme = useTheme();
  return (s: StockStatus) => ({ out: theme.danger, critical: theme.danger, low: theme.warning, ok: theme.success })[s];
}

export function ItemRow({ row }: { row: ItemWithForecast }) {
  const theme = useTheme();
  const { t, locale, industry } = useApp();
  const statusColor = useStatusColor();
  const { item, forecast } = row;
  const horizon = item.leadTimeDays + industry.reviewDays;
  const ratio = forecast.daysLeft === null ? (item.quantity > 0 ? 1 : 0) : forecast.daysLeft / (horizon * 2);

  return (
    <Link href={{ pathname: '/item/[id]', params: { id: item.id } }} asChild>
      <Pressable style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.variant ? (
              <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.variant}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.qty, { color: statusColor(forecast.status) }]}>
              {formatNumber(locale, item.quantity)} <Text style={styles.unit}>{item.unit}</Text>
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              {item.quantity <= 0
                ? t('home.out')
                : forecast.daysLeft === null
                ? t('items.noUsage')
                : t('items.daysLeft', { n: formatNumber(locale, forecast.daysLeft, 0) })}
            </Text>
          </View>
        </View>
        <StockMeter ratio={ratio} color={statusColor(forecast.status)} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingVertical: Spacing.two },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13 },
  qty: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 13, fontWeight: '600' },
});
