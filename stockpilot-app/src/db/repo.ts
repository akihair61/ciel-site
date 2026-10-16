import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { forecast, type Forecast } from '@/lib/forecast';
import type { IndustryProfile } from '@/lib/industries';
import { consumeFefo } from '@/lib/lots';
import type { Item, Lot, Movement, MovementKind, MovementSource } from '@/lib/types';

interface ItemRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  variant: string | null;
  unit: string;
  quantity: number;
  reorder_point: number;
  lead_time_days: number;
  unit_cost: number | null;
  supplier: string | null;
  created_at: string;
  updated_at: string;
}

interface LotRow {
  id: string;
  item_id: string;
  quantity: number;
  expires_on: string | null;
  received_at: string;
}

interface MovementRow {
  id: string;
  item_id: string;
  delta: number;
  kind: MovementKind;
  source: MovementSource;
  note: string | null;
  created_at: string;
}

const toItem = (r: ItemRow): Item => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  barcode: r.barcode,
  category: r.category,
  variant: r.variant,
  unit: r.unit,
  quantity: r.quantity,
  reorderPoint: r.reorder_point,
  leadTimeDays: r.lead_time_days,
  unitCost: r.unit_cost,
  supplier: r.supplier,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toLot = (r: LotRow): Lot => ({
  id: r.id,
  itemId: r.item_id,
  quantity: r.quantity,
  expiresOn: r.expires_on,
  receivedAt: r.received_at,
});

const toMovement = (r: MovementRow): Movement => ({
  id: r.id,
  itemId: r.item_id,
  delta: r.delta,
  kind: r.kind,
  source: r.source,
  note: r.note,
  createdAt: r.created_at,
});

// ---------- items ----------

export async function listItems(db: SQLiteDatabase, search = ''): Promise<Item[]> {
  const q = `%${search.trim()}%`;
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM items
     WHERE ? = '%%' OR name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR variant LIKE ?
     ORDER BY name COLLATE NOCASE`,
    q, q, q, q, q,
  );
  return rows.map(toItem);
}

export async function countItems(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM items');
  return row?.n ?? 0;
}

export async function getItem(db: SQLiteDatabase, id: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ?', id);
  return row ? toItem(row) : null;
}

export async function findByBarcode(db: SQLiteDatabase, barcode: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE barcode = ?', barcode);
  return row ? toItem(row) : null;
}

export interface ItemInput {
  name: string;
  unit: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  variant?: string | null;
  reorderPoint?: number;
  leadTimeDays?: number;
  unitCost?: number | null;
  supplier?: string | null;
}

export async function createItem(db: SQLiteDatabase, input: ItemInput): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO items (id, name, sku, barcode, category, variant, unit, quantity,
       reorder_point, lead_time_days, unit_cost, supplier, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim(),
    input.sku ?? null,
    input.barcode || null,
    input.category ?? null,
    input.variant || null,
    input.unit,
    input.reorderPoint ?? 0,
    input.leadTimeDays ?? 3,
    input.unitCost ?? null,
    input.supplier || null,
    now,
    now,
  );
  return id;
}

export async function updateItem(db: SQLiteDatabase, id: string, input: ItemInput): Promise<void> {
  await db.runAsync(
    `UPDATE items SET name = ?, sku = ?, barcode = ?, category = ?, variant = ?, unit = ?,
       reorder_point = ?, lead_time_days = ?, unit_cost = ?, supplier = ?, updated_at = ?
     WHERE id = ?`,
    input.name.trim(),
    input.sku ?? null,
    input.barcode || null,
    input.category ?? null,
    input.variant || null,
    input.unit,
    input.reorderPoint ?? 0,
    input.leadTimeDays ?? 3,
    input.unitCost ?? null,
    input.supplier || null,
    new Date().toISOString(),
    id,
  );
}

export async function deleteItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM items WHERE id = ?', id);
}

// ---------- movements ----------

export interface MovementInput {
  itemId: string;
  delta: number;
  kind: MovementKind;
  source: MovementSource;
  note?: string | null;
  /** For stock coming in: the lot's expiry date (YYYY-MM-DD). */
  expiresOn?: string | null;
  /** For stock coming in: updates the item's last known unit cost. */
  unitCost?: number | null;
}

/** Apply one stock change atomically: movement log, item total and lots. */
export async function recordMovement(db: SQLiteDatabase, m: MovementInput): Promise<void> {
  if (!Number.isFinite(m.delta) || m.delta === 0) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO movements (id, item_id, delta, kind, source, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(), m.itemId, m.delta, m.kind, m.source, m.note ?? null, now,
    );
    await db.runAsync(
      `UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = ?,
         unit_cost = COALESCE(?, unit_cost)
       WHERE id = ?`,
      m.delta, now, m.unitCost ?? null, m.itemId,
    );
    if (m.delta > 0) {
      await db.runAsync(
        'INSERT INTO lots (id, item_id, quantity, expires_on, received_at) VALUES (?, ?, ?, ?, ?)',
        randomUUID(), m.itemId, m.delta, m.expiresOn || null, now,
      );
    } else {
      const lots = await getLots(db, m.itemId);
      const { changes } = consumeFefo(lots, -m.delta);
      for (const c of changes) {
        if (c.quantity <= 0) await db.runAsync('DELETE FROM lots WHERE id = ?', c.id);
        else await db.runAsync('UPDATE lots SET quantity = ? WHERE id = ?', c.quantity, c.id);
      }
    }
  });
}

/** Stocktake: set the counted quantity and log the difference. */
export async function recordCount(
  db: SQLiteDatabase,
  itemId: string,
  counted: number,
  source: MovementSource,
): Promise<void> {
  const item = await getItem(db, itemId);
  if (!item) return;
  await recordMovement(db, { itemId, delta: counted - item.quantity, kind: 'count', source });
}

export async function listMovements(db: SQLiteDatabase, itemId: string, limit = 50): Promise<Movement[]> {
  const rows = await db.getAllAsync<MovementRow>(
    'SELECT * FROM movements WHERE item_id = ? ORDER BY created_at DESC LIMIT ?',
    itemId, limit,
  );
  return rows.map(toMovement);
}

export async function getLots(db: SQLiteDatabase, itemId: string): Promise<Lot[]> {
  const rows = await db.getAllAsync<LotRow>('SELECT * FROM lots WHERE item_id = ?', itemId);
  return rows.map(toLot);
}

// ---------- forecasting ----------

export interface ItemWithForecast {
  item: Item;
  forecast: Forecast;
}

export async function getForecasts(
  db: SQLiteDatabase,
  profile: IndustryProfile,
  now = new Date(),
): Promise<ItemWithForecast[]> {
  const since = new Date(now.getTime() - 28 * 86_400_000).toISOString();
  const [items, outRows, lotRows] = await Promise.all([
    listItems(db),
    db.getAllAsync<{ item_id: string; delta: number; created_at: string }>(
      // Only real usage counts as demand; stocktake corrections and manual
      // adjustments would distort the rate.
      "SELECT item_id, delta, created_at FROM movements WHERE delta < 0 AND kind = 'out' AND created_at >= ?",
      since,
    ),
    db.getAllAsync<LotRow>('SELECT * FROM lots'),
  ]);

  const outflows = new Map<string, { at: string; quantity: number }[]>();
  for (const r of outRows) {
    const list = outflows.get(r.item_id) ?? [];
    list.push({ at: r.created_at, quantity: -r.delta });
    outflows.set(r.item_id, list);
  }
  const lots = new Map<string, Lot[]>();
  for (const r of lotRows) {
    const list = lots.get(r.item_id) ?? [];
    list.push(toLot(r));
    lots.set(r.item_id, list);
  }

  return items.map((item) => ({
    item,
    forecast: forecast({
      quantity: item.quantity,
      reorderPoint: item.reorderPoint,
      leadTimeDays: item.leadTimeDays,
      reviewDays: profile.reviewDays,
      expiryWarnDays: profile.expiryWarnDays,
      outflows: outflows.get(item.id) ?? [],
      lots: profile.tracksExpiry ? lots.get(item.id) ?? [] : [],
      now,
    }),
  }));
}

// ---------- settings ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}
