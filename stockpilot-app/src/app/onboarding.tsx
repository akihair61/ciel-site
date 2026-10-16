import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Button, Muted, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { seedDemo } from '@/db/demo';
import { useTheme } from '@/hooks/use-theme';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n';
import { INDUSTRY_IDS } from '@/lib/industries';
import type { IndustryId } from '@/lib/types';
import { useApp } from '@/state/app';

export default function Onboarding() {
  const db = useSQLiteContext();
  const { t, locale, setLocale, completeOnboarding } = useApp();
  const [seeding, setSeeding] = useState(false);
  const theme = useTheme();
  const [choice, setChoice] = useState<IndustryId | null>(null);

  return (
    <Screen title={t('onboarding.title')}>
      <Muted>{t('onboarding.subtitle')}</Muted>
      <View style={styles.grid}>
        {INDUSTRY_IDS.map((id, i) => {
          const active = choice === id;
          return (
            <Animated.View key={id} entering={FadeInDown.delay(i * 60).springify()} style={styles.cell}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setChoice(id);
                }}
                style={[
                  styles.tile,
                  { backgroundColor: active ? theme.accent : theme.backgroundElement, borderColor: active ? theme.accent : theme.border },
                ]}>
                <Icon name={id} size={30} color={active ? theme.onAccent : theme.accent} />
                <Text style={[styles.tileText, { color: active ? theme.onAccent : theme.text }]}>{t(`industry.${id}`)}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <Button label={t('onboarding.start')} icon="next" disabled={!choice} onPress={() => choice && completeOnboarding(choice)} />
      <Button
        label={t('onboarding.demo')}
        icon="demo"
        variant="ghost"
        disabled={!choice}
        loading={seeding}
        onPress={async () => {
          if (!choice) return;
          setSeeding(true);
          await seedDemo(db, choice, locale);
          await completeOnboarding(choice);
        }}
      />
      <View style={styles.langs}>
        {LOCALES.map((l) => (
          <Pressable key={l} onPress={() => setLocale(l)}>
            <Text style={{ color: l === locale ? theme.accent : theme.textSecondary, fontWeight: l === locale ? '800' : '500' }}>
              {LOCALE_NAMES[l]}
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { flexBasis: '48%', flexGrow: 1 },
  tile: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    minHeight: 110,
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  tileText: { fontSize: 16, fontWeight: '700' },
  langs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center' },
});
