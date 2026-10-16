import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Scrollable page with a large title, safe-area and tab-bar insets. */
export function Screen({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
      ]}
      keyboardShouldPersistTaps="handled">
      {title ? (
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

/** Liquid Glass on iOS 26+, a soft card elsewhere. */
export function Card({ children, style, index = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; index?: number }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()} layout={LinearTransition.springify()}>
      {glass ? (
        <GlassView glassEffectStyle="regular" style={[styles.card, style]}>
          {children}
        </GlassView>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, styles.cardBorder, style]}>
          {children}
        </View>
      )}
    </Animated.View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = {
    primary: theme.accent,
    secondary: theme.accentSoft,
    danger: theme.danger,
    ghost: 'transparent',
  }[variant];
  const fg = variant === 'primary' ? theme.onAccent : variant === 'danger' ? '#fff' : theme.accent;
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={style}>
      <Animated.View
        style={[
          styles.button,
          pressTransition,
          { backgroundColor: bg, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
        ]}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon ? <Icon name={icon} color={fg} size={18} /> : null}
            <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSelected }]}
        {...props}
      />
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[styles.muted, { color: theme.textSecondary }, style]}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.heading, { color: theme.text }]}>{children}</Text>;
}

/** Days-of-stock meter whose fill animates with a Reanimated 4 CSS transition. */
export function StockMeter({ ratio, color }: { ratio: number; color: string }) {
  const theme = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <View style={[styles.meter, { backgroundColor: theme.backgroundSelected }]}>
      <Animated.View
        style={[{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: Radius.pill }, meterTransition]}
      />
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// Reanimated 4 CSS transitions: declared outside StyleSheet (it only knows RN styles).
const pressTransition = { transitionProperty: 'transform', transitionDuration: 140 } as const;
const meterTransition = { transitionProperty: 'width', transitionDuration: 600, transitionTimingFunction: 'ease-out' } as const;

/** Reanimated 4 CSS keyframe animation for "AI is thinking" text. */
export const breathing = {
  animationName: { from: { opacity: 0.35 }, to: { opacity: 1 } },
  animationDuration: '850ms',
  animationIterationCount: 'infinite',
  animationDirection: 'alternate',
} as const;

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two, overflow: 'hidden' },
  cardBorder: { borderWidth: StyleSheet.hairlineWidth },
  button: {
    minHeight: 48,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  input: { borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 16 },
  muted: { fontSize: 14, lineHeight: 20 },
  heading: { fontSize: 20, fontWeight: '700' },
  meter: { height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  badge: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
