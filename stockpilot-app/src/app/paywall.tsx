import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { billingAvailable, buy, loadOffers, restore, type Offer } from '@/billing/purchases';
import { Icon } from '@/components/icon';
import { Button, Muted, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber, type MessageKey } from '@/lib/i18n';
import { PLANS, type PlanId } from '@/lib/plans';
import { useApp } from '@/state/app';

const PERKS: MessageKey[] = ['paywall.perk.ai', 'paywall.perk.items', 'paywall.perk.forecast', 'paywall.perk.languages'];

export default function Paywall() {
  const app = useApp();
  const { t, locale } = app;
  const theme = useTheme();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [selected, setSelected] = useState<PlanId>('pro');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadOffers()
      .then(setOffers)
      .catch(() => setOffers([]));
  }, []);

  const offerFor = (plan: PlanId) => offers?.find((o) => o.plan === plan);

  const purchase = async () => {
    const offer = offerFor(selected);
    if (!offer) {
      Alert.alert(t('paywall.unavailable'));
      return;
    }
    setBusy(true);
    try {
      const plan = await buy(offer.pkg);
      if (plan) {
        await app.setPlan(plan);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch {
      Alert.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      const plan = await restore();
      await app.setPlan(plan);
      Alert.alert(t(plan === 'free' ? 'paywall.nothingToRestore' : 'paywall.restored'));
    } catch {
      Alert.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ height: Spacing.five }} />
      <LinearGradient colors={[theme.accent, '#8B5CF6', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Icon name="ai" size={30} color="#fff" />
        <Text style={styles.heroTitle}>{t('paywall.title')}</Text>
        {PERKS.map((k) => (
          <View key={k} style={styles.perk}>
            <Icon name="check" size={16} color="#fff" />
            <Text style={styles.perkText}>{t(k)}</Text>
          </View>
        ))}
      </LinearGradient>

      {(['pro', 'business'] as const).map((id, i) => {
        const plan = PLANS[id];
        const active = selected === id;
        const price = offerFor(id)?.pkg.product.priceString ?? t('plan.price', { n: plan.priceUsd });
        return (
          <Animated.View key={id} entering={FadeInDown.delay(i * 80).springify()}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(id);
              }}
              style={[
                styles.plan,
                { borderColor: active ? theme.accent : theme.border, backgroundColor: theme.backgroundElement },
              ]}>
              <View style={{ flex: 1, gap: Spacing.one }}>
                <Text style={[styles.planName, { color: theme.text }]}>
                  {t(`plan.${id}`)} {app.plan.id === id ? `· ${t('paywall.current')}` : ''}
                </Text>
                <Muted>
                  {t('plan.unlimited')} · {t('plan.ai', { n: formatNumber(locale, plan.aiActionsPerMonth, 0) })}
                </Muted>
              </View>
              <Text style={[styles.price, { color: theme.text }]}>{price}</Text>
            </Pressable>
          </Animated.View>
        );
      })}

      <Button
        label={t('paywall.subscribe')}
        icon="next"
        loading={busy}
        disabled={!billingAvailable() || app.plan.id === selected}
        onPress={purchase}
      />
      {!billingAvailable() ? <Muted>{t('paywall.unavailable')}</Muted> : null}
      <Button label={t('paywall.restore')} variant="ghost" disabled={!billingAvailable() || busy} onPress={doRestore} />
      <Muted style={{ textAlign: 'center' }}>{t('paywall.terms')}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.3, marginBottom: Spacing.one },
  perk: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  perkText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  plan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 2, borderRadius: Radius.lg, padding: Spacing.three },
  planName: { fontSize: 18, fontWeight: '800' },
  price: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
