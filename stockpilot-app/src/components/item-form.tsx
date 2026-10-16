import { useState } from 'react';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { ItemInput } from '@/db/repo';
import { useApp } from '@/state/app';

import { Button, Field } from './ui';

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export function ItemForm({ initial, onSubmit }: { initial: ItemInput; onSubmit: (input: ItemInput) => Promise<void> }) {
  const { t, industry } = useApp();
  const [f, setF] = useState({
    name: initial.name,
    unit: initial.unit,
    variant: initial.variant ?? '',
    category: initial.category ?? '',
    barcode: initial.barcode ?? '',
    sku: initial.sku ?? '',
    supplier: initial.supplier ?? '',
    reorderPoint: String(initial.reorderPoint ?? 0),
    leadTimeDays: String(initial.leadTimeDays ?? 3),
    unitCost: initial.unitCost == null ? '' : String(initial.unitCost),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        name: f.name,
        unit: f.unit || industry.defaultUnit,
        variant: f.variant || null,
        category: f.category || null,
        barcode: f.barcode || null,
        sku: f.sku || null,
        supplier: f.supplier || null,
        reorderPoint: num(f.reorderPoint),
        leadTimeDays: Math.max(0, Math.round(num(f.leadTimeDays))),
        unitCost: f.unitCost ? num(f.unitCost) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: Spacing.three }}>
      <Field label={t('item.name')} value={f.name} onChangeText={set('name')} autoFocus={!initial.name} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Field label={t('item.unit')} value={f.unit} onChangeText={set('unit')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('item.reorderPoint')} value={f.reorderPoint} onChangeText={set('reorderPoint')} keyboardType="decimal-pad" />
        </View>
      </View>
      {industry.usesVariants ? <Field label={t('item.variant')} value={f.variant} onChangeText={set('variant')} /> : null}
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Field label={t('item.leadTime')} value={f.leadTimeDays} onChangeText={set('leadTimeDays')} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('item.unitCost')} value={f.unitCost} onChangeText={set('unitCost')} keyboardType="decimal-pad" />
        </View>
      </View>
      <Field label={t('item.supplier')} value={f.supplier} onChangeText={set('supplier')} />
      <Field label={t('item.category')} value={f.category} onChangeText={set('category')} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1 }}>
          <Field label={t('item.barcode')} value={f.barcode} onChangeText={set('barcode')} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('item.sku')} value={f.sku} onChangeText={set('sku')} />
        </View>
      </View>
      <Button label={t('item.save')} icon="check" loading={saving} disabled={!f.name.trim()} onPress={submit} />
    </View>
  );
}
