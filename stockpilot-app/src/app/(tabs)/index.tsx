import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { ItemRow } from '@/components/item-row';
import { Card, Heading, Muted, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useForecasts } from '@/hooks/use-forecasts';
import { useTheme } from '@/hooks/use-theme';
import type { MessageKey } from '@/lib/i18n';
import { syncMorningAlert } from '@/lib/notify';
import { useApp } from '@/state/app';

function Action({ icon, title, hint, onPress, index }: { icon: IconName; title: string; hint: string; onPress: () => void; index: number }) {
  const theme = useTheme();
  return (
    <Card index={index} style={{ padding: 0 }}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.actionIcon, { backgroundColor: theme.accentSoft }]}>
          <Icon name={icon} size={22} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.actionTitle, { color: theme.text }]}>{title}</Text>
          <Muted>{hint}</Muted>
        </View>
        <Icon name="chevron" size={14} color={theme.textSecondary} />
      </Pressable>
    </Card>
  );
}

export default function Home() {
  const { t, shopName, locale } = useApp();
  const theme = useTheme();
  const rows = useForecasts();

  const groups: { key: MessageKey; color: string; rows: NonNullable<typeof rows> }[] = rows
    ? [
        { key: 'home.out', color: theme.danger, rows: rows.filter((r) => r.forecast.status === 'out') },
        { key: 'home.critical', color: theme.danger, rows: rows.filter((r) => r.forecast.status === 'critical') },
        { key: 'home.low', color: theme.warning, rows: rows.filter((r) => r.forecast.status === 'low') },
        { key: 'home.expiring', color: theme.info, rows: rows.filter((r) => r.forecast.expiringSoon) },
      ]
    : [];
  const alerts = groups.filter((g) => g.rows.length > 0);
  const toOrder = rows?.filter((r) => r.forecast.suggestedOrder > 0) ?? [];

  // Automatic morning reminder that tracks what needs ordering.
  useEffect(() => {
    if (!rows) return;
    syncMorningAlert(
      t('orders.title'),
      toOrder.length > 0
        ? toOrder
            .slice(0, 4)
            .map((r) => r.item.name)
            .join(locale === 'ja' || locale === 'zh' ? '、' : ', ')
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <Screen title={shopName || t('home.title')}>
      {alerts.length > 0 ? (
        <Animated.View entering={FadeIn} style={styles.stats}>
          {alerts.map((g) => (
            <View key={g.key} style={[styles.stat, { backgroundColor: g.color + '1A' }]}>
              <Text style={[styles.statNumber, { color: g.color }]}>{g.rows.length}</Text>
              <Text style={[styles.statLabel, { color: g.color }]} numberOfLines={1}>
                {t(g.key)}
              </Text>
            </View>
          ))}
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeIn.duration(500)}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/assistant', params: { q: t('assistant.q.today') } })}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <LinearGradient
            colors={[theme.accent, '#8B5CF6', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}>
            <View style={styles.heroTop}>
              <Icon name="ai" size={22} color="#fff" />
              <Text style={styles.heroLabel}>{t('assistant.title')}</Text>
            </View>
            <Text style={styles.heroTitle}>{t('assistant.today')}</Text>
            <Text style={styles.heroHint}>{t('assistant.todayHint')}</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <View style={{ gap: Spacing.two }}>
        <Action index={0} icon="shelf" title={t('home.shelf')} hint={t('home.shelfHint')} onPress={() => router.navigate({ pathname: '/capture', params: { mode: 'shelf' } })} />
        <Action index={1} icon="invoice" title={t('home.invoice')} hint={t('home.invoiceHint')} onPress={() => router.navigate({ pathname: '/capture', params: { mode: 'invoice' } })} />
        <Action index={2} icon="voice" title={t('home.voice')} hint={t('home.voiceHint')} onPress={() => router.push('/voice')} />
      </View>

      {rows && rows.length === 0 ? <Muted>{t('home.empty')}</Muted> : null}
      {rows && rows.length > 0 && alerts.length === 0 ? <Muted>{t('home.allGood')}</Muted> : null}

      {alerts.map((g, i) => (
        <Card key={g.key} index={i + 3}>
          <Heading>{t(g.key)}</Heading>
          {g.rows.slice(0, 5).map((r) => (
            <ItemRow key={r.item.id} row={r} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { flexGrow: 1, flexBasis: '45%', borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
  statNumber: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, fontWeight: '700' },
  hero: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 14 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  heroHint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  actionIcon: { width: 44, height: 44, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 17, fontWeight: '700' },
});
