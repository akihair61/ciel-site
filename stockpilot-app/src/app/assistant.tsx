import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { aiErrorMessage, askAssistant, type AssistantResult } from '@/ai/client';
import { fromVoice, setPendingReview } from '@/ai/review';
import { Button, breathing } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { getForecasts } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { canUseAi } from '@/lib/plans';
import { useApp } from '@/state/app';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  result?: AssistantResult;
}

export default function Assistant() {
  const db = useSQLiteContext();
  const app = useApp();
  const { t } = app;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const asked = useRef(false);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    if (!canUseAi(app.plan, app.aiUsed)) {
      setTurns((prev) => [...prev, { role: 'assistant', text: t('plan.quota') }]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const history = turns.slice(-10).map(({ role, text }) => ({ role, text }));
    setTurns((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const rows = await getForecasts(db, app.industry);
      const result = await askAssistant(
        { deviceId: app.deviceId, locale: app.locale, industry: app.industry.id },
        {
          shopName: app.shopName,
          today: new Date().toISOString().slice(0, 10),
          history,
          question: text,
          snapshot: rows.map(({ item, forecast }) => ({
            id: item.id,
            name: item.name,
            variant: item.variant,
            unit: item.unit,
            quantity: item.quantity,
            dailyUsage: Math.round(forecast.dailyUsage * 100) / 100,
            daysLeft: forecast.daysLeft === null ? null : Math.round(forecast.daysLeft * 10) / 10,
            suggestedOrder: forecast.suggestedOrder,
            expiringSoon: forecast.expiringSoon?.expiresOn ?? null,
            wasteRisk: forecast.wasteRisk,
            unitCost: item.unitCost,
            supplier: item.supplier,
          })),
        },
      );
      await app.noteAiUse();
      setTurns((prev) => [...prev, { role: 'assistant', text: result.answer, result }]);
    } catch (err) {
      setTurns((prev) => [...prev, { role: 'assistant', text: aiErrorMessage(t, err) }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (q && !asked.current) {
      asked.current = true;
      ask(q);
    }
    // Only the initial question from the route should auto-send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const applyActions = (result: AssistantResult) => {
    setPendingReview({
      source: 'voice',
      title: t('assistant.title'),
      rows: fromVoice({ operations: result.actions, clarification: null }),
      supplier: null,
      clarification: null,
    });
    router.push('/review');
  };

  const starters = [t('assistant.q.order'), t('assistant.q.waste'), t('assistant.q.cost')];
  const last = turns.at(-1);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + 60 }]}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {turns.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="ai" size={40} color={theme.accent} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('assistant.intro')}</Text>
          </View>
        ) : null}

        {turns.map((turn, i) => (
          <Animated.View
            key={i}
            entering={FadeInUp.springify()}
            layout={LinearTransition}
            style={[
              styles.bubble,
              turn.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: theme.accent }
                : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement },
            ]}>
            <Text selectable style={{ color: turn.role === 'user' ? theme.onAccent : theme.text, fontSize: 16, lineHeight: 23 }}>
              {turn.text}
            </Text>
            {turn.result && turn.result.actions.length > 0 ? (
              <Button label={t('capture.apply')} icon="check" variant="secondary" onPress={() => applyActions(turn.result!)} />
            ) : null}
          </Animated.View>
        ))}

        {busy ? (
          <Animated.Text style={[styles.thinking, breathing, { color: theme.textSecondary }]}>{t('capture.thinking')}</Animated.Text>
        ) : null}
      </ScrollView>

      <View style={[styles.chips]}>
        {(last?.result?.followUps.length ? last.result.followUps : turns.length === 0 ? starters : []).map((s) => (
          <Pressable key={s} onPress={() => ask(s)} style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
            <Text style={{ color: theme.accent, fontWeight: '600' }} numberOfLines={1}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.two, borderColor: theme.border }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={t('assistant.placeholder')}
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.send')}
          onPress={() => ask(input)}
          disabled={!input.trim() || busy}
          style={[styles.send, { backgroundColor: theme.accent, opacity: !input.trim() || busy ? 0.4 : 1 }]}>
          <Icon name="up" size={20} color={theme.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  emptyText: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  bubble: { maxWidth: '88%', borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  thinking: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  chip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, maxWidth: '100%' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 16, maxHeight: 120 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
