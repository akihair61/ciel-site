import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { ItemRow } from '@/components/item-row';
import { Button, Card, Muted, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useForecasts } from '@/hooks/use-forecasts';
import { useTheme } from '@/hooks/use-theme';
import { canAddItem } from '@/lib/plans';
import { useApp } from '@/state/app';

export default function Items() {
  const { t, plan } = useApp();
  const theme = useTheme();
  const rows = useForecasts();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());

  const filtered = (rows ?? []).filter(({ item }) =>
    !deferred ||
    [item.name, item.sku, item.barcode, item.variant, item.category].some((v) => v?.toLowerCase().includes(deferred)),
  );
  const atLimit = rows ? !canAddItem(plan, rows.length) : false;

  return (
    <Screen
      title={t('items.title')}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.title')}
          onPress={() => router.push('/assistant')}
          hitSlop={10}
          style={{ backgroundColor: theme.accentSoft, borderRadius: Radius.pill, padding: Spacing.two }}>
          <Icon name="ai" size={20} color={theme.accent} />
        </Pressable>
      }>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('items.search')}
        placeholderTextColor={theme.textSecondary}
        clearButtonMode="while-editing"
        style={{
          backgroundColor: theme.backgroundSelected,
          color: theme.text,
          borderRadius: Radius.md,
          paddingHorizontal: Spacing.three,
          paddingVertical: 12,
          fontSize: 16,
        }}
      />
      <Button label={t('items.add')} icon="plus" variant="secondary" disabled={atLimit} onPress={() => router.push('/item/new')} />
      {atLimit ? <Muted>{t('items.limit', { n: plan.maxItems })}</Muted> : null}

      {filtered.length > 0 ? (
        <Card>
          {filtered.map((r) => (
            <Animated.View key={r.item.id} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
              <ItemRow row={r} />
            </Animated.View>
          ))}
        </Card>
      ) : rows ? (
        <View>
          <Muted>{t('home.empty')}</Muted>
        </View>
      ) : null}
    </Screen>
  );
}
