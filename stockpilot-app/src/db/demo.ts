import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Locale } from '@/lib/i18n';
import type { IndustryId } from '@/lib/types';

interface DemoItem {
  name: { en: string; ja: string };
  unit: { en: string; ja: string };
  variant?: string;
  onHand: number;
  perDay: number;
  leadTimeDays: number;
  unitCost: number;
  supplier: string;
  /** Days from today until the oldest lot expires. */
  expiresInDays?: number;
}

const DEMO: Record<IndustryId, DemoItem[]> = {
  salon: [
    { name: { en: 'Shampoo 1L', ja: 'シャンプー 1L' }, unit: { en: 'btl', ja: '本' }, onHand: 3, perDay: 0.8, leadTimeDays: 3, unitCost: 18, supplier: 'Milbon' },
    { name: { en: 'Color 6NB', ja: 'カラー剤 6NB' }, unit: { en: 'tube', ja: '本' }, onHand: 14, perDay: 1.2, leadTimeDays: 5, unitCost: 9, supplier: 'Milbon', expiresInDays: 40 },
    { name: { en: 'Developer 6%', ja: 'オキシ 6%' }, unit: { en: 'btl', ja: '本' }, onHand: 6, perDay: 0.4, leadTimeDays: 5, unitCost: 12, supplier: 'Milbon' },
    { name: { en: 'Treatment mask', ja: 'トリートメント' }, unit: { en: 'jar', ja: '個' }, onHand: 9, perDay: 0.3, leadTimeDays: 7, unitCost: 25, supplier: 'Aveda', expiresInDays: 20 },
    { name: { en: 'Neck paper', ja: 'ネックペーパー' }, unit: { en: 'roll', ja: '巻' }, onHand: 0, perDay: 0.5, leadTimeDays: 2, unitCost: 4, supplier: 'Beauty Supply' },
    { name: { en: 'Towels', ja: 'タオル' }, unit: { en: 'pcs', ja: '枚' }, onHand: 60, perDay: 2, leadTimeDays: 7, unitCost: 3, supplier: 'Beauty Supply' },
  ],
  food: [
    { name: { en: 'Jasmine rice', ja: '米' }, unit: { en: 'kg', ja: 'kg' }, onHand: 12, perDay: 4, leadTimeDays: 2, unitCost: 1.2, supplier: 'Makro' },
    { name: { en: 'Chicken thigh', ja: '鶏もも肉' }, unit: { en: 'kg', ja: 'kg' }, onHand: 6, perDay: 2.5, leadTimeDays: 1, unitCost: 4, supplier: 'Fresh Meat Co.', expiresInDays: 2 },
    { name: { en: 'Eggs', ja: '卵' }, unit: { en: 'pcs', ja: '個' }, onHand: 120, perDay: 30, leadTimeDays: 1, unitCost: 0.12, supplier: 'Farm Direct', expiresInDays: 9 },
    { name: { en: 'Milk', ja: '牛乳' }, unit: { en: 'L', ja: 'L' }, onHand: 8, perDay: 2, leadTimeDays: 1, unitCost: 1.5, supplier: 'Farm Direct', expiresInDays: 3 },
    { name: { en: 'Olive oil', ja: 'オリーブオイル' }, unit: { en: 'btl', ja: '本' }, onHand: 2, perDay: 0.4, leadTimeDays: 3, unitCost: 9, supplier: 'Makro' },
    { name: { en: 'Coffee beans', ja: 'コーヒー豆' }, unit: { en: 'kg', ja: 'kg' }, onHand: 4, perDay: 0.6, leadTimeDays: 4, unitCost: 22, supplier: 'Roastery' },
  ],
  retail: [
    { name: { en: 'Canvas tote', ja: 'キャンバストート' }, unit: { en: 'pcs', ja: '個' }, onHand: 18, perDay: 1.5, leadTimeDays: 10, unitCost: 6, supplier: 'Bag Works' },
    { name: { en: 'Scented candle', ja: 'アロマキャンドル' }, unit: { en: 'pcs', ja: '個' }, onHand: 4, perDay: 0.8, leadTimeDays: 7, unitCost: 8, supplier: 'Lumen' },
    { name: { en: 'Notebook A5', ja: 'ノート A5' }, unit: { en: 'pcs', ja: '冊' }, onHand: 40, perDay: 1, leadTimeDays: 5, unitCost: 2, supplier: 'Paper Co.' },
    { name: { en: 'Ceramic mug', ja: 'マグカップ' }, unit: { en: 'pcs', ja: '個' }, onHand: 0, perDay: 0.6, leadTimeDays: 14, unitCost: 5, supplier: 'Kiln Studio' },
  ],
  fashion: [
    { name: { en: 'Linen shirt', ja: 'リネンシャツ' }, unit: { en: 'pcs', ja: '枚' }, variant: 'M / White', onHand: 3, perDay: 0.5, leadTimeDays: 14, unitCost: 22, supplier: 'Atelier K' },
    { name: { en: 'Linen shirt', ja: 'リネンシャツ' }, unit: { en: 'pcs', ja: '枚' }, variant: 'L / White', onHand: 9, perDay: 0.3, leadTimeDays: 14, unitCost: 22, supplier: 'Atelier K' },
    { name: { en: 'Wide denim', ja: 'ワイドデニム' }, unit: { en: 'pcs', ja: '本' }, variant: '28 / Indigo', onHand: 6, perDay: 0.4, leadTimeDays: 21, unitCost: 30, supplier: 'Okayama Denim' },
    { name: { en: 'Leather loafer', ja: 'レザーローファー' }, unit: { en: 'pair', ja: '足' }, variant: '25.5 / Black', onHand: 1, perDay: 0.2, leadTimeDays: 30, unitCost: 60, supplier: 'Shoe Lab' },
  ],
  pharmacy: [
    { name: { en: 'Paracetamol 500mg', ja: 'アセトアミノフェン 500mg' }, unit: { en: 'box', ja: '箱' }, variant: '20 tabs', onHand: 25, perDay: 3, leadTimeDays: 2, unitCost: 1.5, supplier: 'MedSupply', expiresInDays: 200 },
    { name: { en: 'Vitamin C 1000', ja: 'ビタミンC 1000' }, unit: { en: 'btl', ja: '本' }, onHand: 6, perDay: 0.8, leadTimeDays: 5, unitCost: 7, supplier: 'NutriCo', expiresInDays: 25 },
    { name: { en: 'Bandages', ja: '絆創膏' }, unit: { en: 'box', ja: '箱' }, onHand: 3, perDay: 0.7, leadTimeDays: 3, unitCost: 2, supplier: 'MedSupply' },
    { name: { en: 'Eye drops', ja: '目薬' }, unit: { en: 'btl', ja: '本' }, onHand: 12, perDay: 0.4, leadTimeDays: 4, unitCost: 4, supplier: 'MedSupply', expiresInDays: 12 },
  ],
  other: [
    { name: { en: 'Printer paper', ja: 'コピー用紙' }, unit: { en: 'pack', ja: '冊' }, onHand: 5, perDay: 0.6, leadTimeDays: 2, unitCost: 4, supplier: 'Office Plus' },
    { name: { en: 'Packing tape', ja: '梱包テープ' }, unit: { en: 'roll', ja: '巻' }, onHand: 2, perDay: 0.5, leadTimeDays: 3, unitCost: 2, supplier: 'Office Plus' },
    { name: { en: 'Shipping boxes', ja: '段ボール' }, unit: { en: 'pcs', ja: '箱' }, onHand: 50, perDay: 3, leadTimeDays: 5, unitCost: 0.8, supplier: 'BoxCo' },
  ],
};

const HISTORY_DAYS = 21;
const DAY_MS = 86_400_000;

/** Load realistic sample stock with three weeks of usage so forecasts light up. */
export async function seedDemo(db: SQLiteDatabase, industry: IndustryId, locale: Locale): Promise<void> {
  const lang = locale === 'ja' ? 'ja' : 'en';
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const d of DEMO[industry]) {
      const id = randomUUID();
      const created = new Date(now - HISTORY_DAYS * DAY_MS).toISOString();
      await db.runAsync(
        `INSERT INTO items (id, name, sku, barcode, category, variant, unit, quantity, reorder_point,
           lead_time_days, unit_cost, supplier, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        id, d.name[lang], d.variant ?? null, d.unit[lang], d.onHand, d.leadTimeDays, d.unitCost, d.supplier, created, created,
      );
      // Daily usage with some day-to-day wobble (deterministic, no Math.random).
      for (let day = HISTORY_DAYS; day >= 1; day--) {
        const wobble = 1 + 0.35 * Math.sin(day * 1.7 + d.perDay);
        const qty = Math.round(d.perDay * wobble * 10) / 10;
        if (qty <= 0) continue;
        await db.runAsync(
          "INSERT INTO movements (id, item_id, delta, kind, source, note, created_at) VALUES (?, ?, ?, 'out', 'manual', NULL, ?)",
          randomUUID(), id, -qty, new Date(now - day * DAY_MS + 10 * 3_600_000).toISOString(),
        );
      }
      if (d.onHand > 0) {
        const firstLot = d.expiresInDays === undefined ? d.onHand : Math.ceil(d.onHand / 2);
        const expires = d.expiresInDays === undefined ? null : new Date(now + d.expiresInDays * DAY_MS).toISOString().slice(0, 10);
        await db.runAsync(
          'INSERT INTO lots (id, item_id, quantity, expires_on, received_at) VALUES (?, ?, ?, ?, ?)',
          randomUUID(), id, firstLot, expires, created,
        );
        if (firstLot < d.onHand) {
          const later = new Date(now + (d.expiresInDays! + 30) * DAY_MS).toISOString().slice(0, 10);
          await db.runAsync(
            'INSERT INTO lots (id, item_id, quantity, expires_on, received_at) VALUES (?, ?, ?, ?, ?)',
            randomUUID(), id, d.onHand - firstLot, later, created,
          );
        }
      }
    }
  });
}
