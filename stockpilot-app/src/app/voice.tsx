import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { alertAiError, alertQuota, parseVoice } from '@/ai/client';
import { fromVoice, setPendingReview } from '@/ai/review';
import { Muted } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { listItems } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { SPEECH_LANG } from '@/lib/i18n';
import { canUseAi } from '@/lib/plans';
import { useApp } from '@/state/app';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Reanimated 4 CSS keyframes: the mic gently pulses while listening.
const pulsing = {
  animationName: { '0%': { transform: [{ scale: 1 }] }, '50%': { transform: [{ scale: 1.12 }] }, '100%': { transform: [{ scale: 1 }] } },
  animationDuration: '1.2s',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'ease-in-out',
} as const;

export default function Voice() {
  const db = useSQLiteContext();
  const app = useApp();
  const { t } = app;
  const theme = useTheme();
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');

  const submit = async (text: string) => {
    if (!canUseAi(app.plan, app.aiUsed)) {
      alertQuota(t);
      return;
    }
    setBusy(true);
    try {
      const items = await listItems(db);
      const result = await parseVoice(
        {
          deviceId: app.deviceId,
          locale: app.locale,
          industry: app.industry.id,
          knownItems: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, variant: i.variant })),
        },
        text,
      );
      await app.noteAiUse();
      setPendingReview({ source: 'voice', title: text, rows: fromVoice(result), supplier: null, clarification: result.clarification });
      router.replace('/review');
    } catch (err) {
      alertAiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    setTranscript(text);
    if (e.isFinal && text) submit(text);
  });
  useSpeechRecognitionEvent('error', () => setListening(false));

  const toggle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return;
    setTranscript('');
    ExpoSpeechRecognitionModule.start({
      lang: SPEECH_LANG[app.locale],
      interimResults: true,
      continuous: false,
      // On-device models don't exist for every language, so allow the OS service.
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Muted>{t('voice.example')}</Muted>
      <Text style={[styles.transcript, { color: theme.text }]}>{transcript || ' '}</Text>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t('voice.hold')}
        onPress={toggle}
        disabled={busy}
        style={[
          styles.mic,
          { backgroundColor: listening ? theme.danger : theme.accent },
          listening && pulsing,
        ]}>
        <Icon name={busy ? 'ai' : listening ? 'stop' : 'mic'} size={36} color="#fff" />
      </AnimatedPressable>
      <Muted>{busy ? t('capture.thinking') : listening ? t('voice.listening') : t('voice.hold')}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.four, padding: Spacing.four },
  transcript: { fontSize: 22, fontWeight: '700', textAlign: 'center', minHeight: 60 },
  mic: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
});
