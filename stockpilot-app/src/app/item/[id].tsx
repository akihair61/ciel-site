import * as Haptics from 'expo-haptics';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useStatusColor } from '@/components/item-row';
import { ItemForm } from '@/components/item-form';
import { Badge, Button, Card, Heading, Muted, Screen, StockMeter } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  deleteItem,
  getForecasts,
  getLots,
  listMovements,
  recordCount,
  recordMovement,
  updateItem,
  type ItemWithForecast,
} from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatNumber } from '@/lib/i18n';
import type { Lot, Movement } from '@/lib/types';
import { useApp } from '@/state/app';

type Op = 'out' | 'in' | 'count';

export default function ItemDetail() {
  const db = useSQLiteContext();
  const app = useApp();
  const { t, locale, industry } = app;
  const theme = useTheme();
  const statusColor = useStatusColor();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ItemWithForecast | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [history, setHistory] = useState<Movement[]>([]);
  const [op, setOp] = useState<Op>('out');
  const [amount, setAmount] = useState('1');
  const [expiry, setExpiry] = useState('');
  const [editing, setEditing] = useState(false);

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    let alive = true;
    Promise.all([getForecasts(db, industry), getLots(db, id), listMovements(db, id, 30)]).then(([all, l, h]) => {
      if (!alive) return;
      setData(all.find((r) => r.item.id === id) ?? null);
      setLots(l);
      setHistory(h);
    });
    return () => {
      alive = false;
    };
  }, [db, id, industry, reload]);

  if (!data) return null;
  const { item, forecast } = data;
  const color = statusColor(forecast.status);

  const change = async (delta: number) => {
    Haptics.impactAsync(delta > 0 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Rigid);
    await recordMovement(db, { itemId: item.id, delta, kind: delta > 0 ? 'in' : 'out', source: 'manual' });
    app.bump();
    load();
  };

  const submitOp = async () => {
    const n = Number(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    if (op === 'count') await recordCount(db, item.id, n, 'manual');
    else
      await recordMovement(db, {
        itemId: item.id,
        delta: op === 'in' ? n : -n,
        kind: op,
        source: 'manual',
        expiresOn: op === 'in' && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
      });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setExpiry('');
    app.bump();
    load();
  };

  const remove = () =>
    Alert.alert(t('item.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('item.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteItem(db, item.id);
          app.bump();
          router.back();
        },
      },
    ]);

  const ops: { id: Op; label: string }[] = [
    { id: 'out', label: t('item.use') },
    { id: 'in', label: t('item.receive') },
    { id: 'count', label: t('item.count') },
  ];

  return (
    <Screen>
      <Stack.Screen options={{ title: item.name }} />
      <View style={{ height: Spacing.five }} />

      {/* Hero: big number with one-tap -/+ */}
      <Card index={0}>
        <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
        {item.variant ? <Muted>{item.variant}</Muted> : null}
        <View style={styles.hero}>
          <Pressable accessibilityLabel="-1" onPress={() => change(-1)} style={[styles.step, { backgroundColor: theme.backgroundSelected }]}>
            <Text style={[styles.stepText, { color: theme.text }]}>−</Text>
          </Pressable>
          <Animated.Text key={item.quantity} entering={FadeIn.duration(250)} style={[styles.qty, { color }]}>
            {formatNumber(locale, item.quantity)}
            <Text style={[styles.unit, { color: theme.textSecondary }]}> {item.unit}</Text>
          </Animated.Text>
          <Pressable accessibilityLabel="+1" onPress={() => change(1)} style={[styles.step, { backgroundColor: theme.accent }]}>
            <Text style={[styles.stepText, { color: theme.onAccent }]}>+</Text>
          </Pressable>
        </View>
        <StockMeter
          ratio={forecast.daysLeft === null ? (item.quantity > 0 ? 1 : 0) : forecast.daysLeft / ((item.leadTimeDays + industry.reviewDays) * 2)}
          color={color}
        />
      </Card>

      {/* Forecast */}
      <Card index={1}>
        <Heading>{t('item.forecast')}</Heading>
        {forecast.dailyUsage > 0 ? (
          <>
            <Muted>{t('item.perDay', { n: formatNumber(locale, forecast.dailyUsage), unit: item.unit })}</Muted>
            {forecast.stockoutDate ? <Muted>{t('item.stockout', { date: formatDate(locale, forecast.stockoutDate) })}</Muted> : null}
          </>
        ) : (
          <Muted>{t('items.noUsage')}</Muted>
        )}
        {forecast.suggestedOrder > 0 ? (
          <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 17 }}>
            {t('item.suggest', { n: formatNumber(locale, forecast.suggestedOrder, 0), unit: item.unit })}
          </Text>
        ) : null}
        {forecast.wasteRisk > 0 ? (
          <Badge label={`${t('home.waste')}: ${formatNumber(locale, forecast.wasteRisk)} ${item.unit}`} color={theme.danger} />
        ) : null}
        {forecast.confidence === 'low' ? <Muted>{t('item.lowConfidence')}</Muted> : null}
      </Card>

      {/* Use / receive / stocktake */}
      <Card index={2}>
        <View style={[styles.segment, { backgroundColor: theme.backgroundSelected }]}>
          {ops.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => {
                Haptics.selectionAsync();
                setOp(o.id);
                setAmount(o.id === 'count' ? String(item.quantity) : '1');
              }}
              style={[styles.segmentItem, op === o.id && { backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.text, fontWeight: op === o.id ? '800' : '500' }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.opRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.amount, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
          />
          {op === 'in' && industry.tracksExpiry ? (
            <TextInput
              value={expiry}
              onChangeText={setExpiry}
              placeholder={t('item.expiresOn')}
              placeholderTextColor={theme.textSecondary}
              style={[styles.expiry, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
            />
          ) : null}
        </View>
        <Button label={ops.find((o) => o.id === op)!.label} onPress={submitOp} />
      </Card>

      {industry.tracksExpiry && lots.some((l) => l.expiresOn) ? (
        <Card index={3}>
          <Heading>{t('home.expiring')}</Heading>
          {lots
            .filter((l) => l.expiresOn)
            .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!))
            .map((l) => (
              <View key={l.id} style={styles.histRow}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>{formatDate(locale, l.expiresOn!)}</Text>
                <Text style={{ color: theme.textSecondary }}>
                  {formatNumber(locale, l.quantity)} {item.unit}
                </Text>
              </View>
            ))}
        </Card>
      ) : null}

      <Card index={4}>
        <Heading>{t('item.history')}</Heading>
        {history.length === 0 ? <Muted>—</Muted> : null}
        {history.map((m) => (
          <View key={m.id} style={styles.histRow}>
            <Text style={{ color: theme.textSecondary }}>
              {formatDate(locale, m.createdAt)} · {t(`kind.${m.kind}`)}
            </Text>
            <Text style={{ color: m.delta > 0 ? theme.success : theme.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {m.delta > 0 ? '+' : ''}
              {formatNumber(locale, m.delta)}
            </Text>
          </View>
        ))}
      </Card>

      <Card index={5}>
        {editing ? (
          <ItemForm
            initial={item}
            onSubmit={async (input) => {
              await updateItem(db, item.id, input);
              setEditing(false);
              app.bump();
              load();
            }}
          />
        ) : (
          <Button label={t('item.edit')} variant="secondary" icon="edit" onPress={() => setEditing(true)} />
        )}
        <Button label={t('item.delete')} variant="ghost" icon="trash" onPress={remove} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three },
  step: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 32, fontWeight: '600', marginTop: -2 },
  qty: { fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  unit: { fontSize: 18, fontWeight: '600' },
  segment: { flexDirection: 'row', borderRadius: Radius.pill, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.pill },
  opRow: { flexDirection: 'row', gap: Spacing.two },
  amount: { flex: 1, minWidth: 0, fontSize: 28, fontWeight: '800', textAlign: 'center', borderRadius: Radius.md, paddingVertical: 10 },
  expiry: { flex: 1.4, minWidth: 0, fontSize: 15, borderRadius: Radius.md, paddingHorizontal: Spacing.three },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
});
