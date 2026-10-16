import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, ScrollView } from 'react-native';

import { ItemForm } from '@/components/item-form';
import { Spacing } from '@/constants/theme';
import { countItems, createItem } from '@/db/repo';
import { useTheme } from '@/hooks/use-theme';
import { canAddItem } from '@/lib/plans';
import { useApp } from '@/state/app';

export default function NewItem() {
  const db = useSQLiteContext();
  const { t, industry, plan, bump } = useApp();
  const theme = useTheme();
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: Spacing.three, paddingTop: Spacing.five }}
      keyboardShouldPersistTaps="handled">
      <ItemForm
        initial={{ name: '', unit: industry.defaultUnit, barcode: barcode ?? null, leadTimeDays: 3, reorderPoint: 0 }}
        onSubmit={async (input) => {
          if (!canAddItem(plan, await countItems(db))) {
            Alert.alert(t('items.limit', { n: plan.maxItems }));
            return;
          }
          try {
            const id = await createItem(db, input);
            bump();
            router.replace({ pathname: '/item/[id]', params: { id } });
          } catch {
            // Most likely the barcode is already used by another item.
            Alert.alert(t('common.error'));
          }
        }}
      />
    </ScrollView>
  );
}
