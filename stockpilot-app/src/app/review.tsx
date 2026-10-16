import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { applyReview, takePendingReview, type PendingReview, type ReviewRow } from '@/ai/review';
import { Badge, Button, Card, Muted, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app';

export default function Review() {
  const db = useSQLiteContext();
  const app = useApp();
  const { t } = app;
  const theme = useTheme();
  const [review, setReview] = useState<PendingReview | null>(() => takePendingReview());
  const [saving, setSaving] = useState(false);

  if (!review) return <Screen><Muted>{t('common.error')}</Muted></Screen>;

  const update = (key: string, patch: Partial<ReviewRow>) =>
    setReview({ ...review, rows: review.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  const modeLabel = { count: t('kind.count'), in: t('kind.in'), out: t('kind.out') } as const;
  const confColor = { high: theme.success, medium: theme.warning, low: theme.danger } as const;

  const apply = async () => {
    setSaving(true);
    try {
      const { blocked } = await applyReview(db, review, { plan: app.plan, defaultUnit: app.industry.defaultUnit });
      app.bump();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (blocked > 0) Alert.alert(t('items.limit', { n: app.plan.maxItems }));
      router.back();
    } catch {
      Alert.alert(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title={review.title}>
      {review.clarification ? (
        <Card>
          <Text style={{ color: theme.warning, fontWeight: '700' }}>{review.clarification}</Text>
        </Card>
      ) : null}

      {review.rows.map((row, i) => (
        <Animated.View key={row.key} entering={FadeInDown.delay(i * 50).springify()} layout={LinearTransition}>
          <Card style={{ opacity: row.include ? 1 : 0.5 }}>
            <View style={styles.head}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.include }}
                onPress={() => {
                  Haptics.selectionAsync();
                  update(row.key, { include: !row.include });
                }}
                hitSlop={8}>
                <Icon name={row.include ? 'checked' : 'unchecked'} size={26} color={row.include ? theme.accent : theme.textSecondary} />
              </Pressable>
              <TextInput
                value={row.name}
                onChangeText={(name) => update(row.key, { name })}
                style={[styles.name, { color: theme.text }]}
                editable={!row.matchedItemId}
              />
              <TextInput
                value={String(row.quantity)}
                onChangeText={(v) => update(row.key, { quantity: Number(v.replace(',', '.')) })}
                keyboardType="decimal-pad"
                style={[styles.qty, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
              />
            </View>
            <View style={styles.badges}>
              <Badge label={modeLabel[row.mode]} color={theme.accent} />
              {!row.matchedItemId ? <Badge label={t('capture.new')} color={theme.info} /> : null}
              {row.confidence !== 'high' ? <Badge label={row.confidence} color={confColor[row.confidence]} /> : null}
              {row.expiresOn ? <Badge label={row.expiresOn} color={theme.warning} /> : null}
            </View>
            {row.note ? <Muted>{row.note}</Muted> : null}
          </Card>
        </Animated.View>
      ))}

      <Button label={t('capture.apply')} icon="check" loading={saving} disabled={!review.rows.some((r) => r.include)} onPress={apply} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, fontSize: 16, fontWeight: '700' },
  qty: { width: 80, textAlign: 'right', fontSize: 18, fontWeight: '800', borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
