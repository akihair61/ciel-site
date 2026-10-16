import type { SQLiteDatabase } from 'expo-sqlite';

import { countItems, createItem, recordCount, recordMovement } from '@/db/repo';
import { canAddItem, type Plan } from '@/lib/plans';
import type { MovementSource } from '@/lib/types';

import type { Confidence, InvoiceResult, ShelfResult, VoiceResult } from './client';

/** One proposed stock change the owner confirms on the review screen. */
export interface ReviewRow {
  key: string;
  matchedItemId: string | null;
  name: string;
  quantity: number;
  mode: 'count' | 'in' | 'out';
  unitCost: number | null;
  expiresOn: string | null;
  confidence: Confidence;
  note: string | null;
  include: boolean;
}

export interface PendingReview {
  source: MovementSource;
  title: string;
  rows: ReviewRow[];
  supplier: string | null;
  clarification: string | null;
}

// The review screen reads the latest AI result from here; results can be too
// large for route params (and contain no secrets worth persisting).
let pending: PendingReview | null = null;
export const setPendingReview = (p: PendingReview) => {
  pending = p;
};
export const takePendingReview = () => pending;

export function fromShelf(r: ShelfResult): ReviewRow[] {
  return r.items.map((it, i) => ({
    key: `s${i}`,
    matchedItemId: it.matchedItemId,
    name: it.name,
    quantity: it.count,
    mode: 'count',
    unitCost: null,
    expiresOn: null,
    confidence: it.confidence,
    note: it.note,
    // Low-confidence new items are easy to add by mistake; leave them unticked.
    include: it.confidence !== 'low' || it.matchedItemId !== null,
  }));
}

export function fromInvoice(r: InvoiceResult): ReviewRow[] {
  return r.lines.map((l, i) => ({
    key: `i${i}`,
    matchedItemId: l.matchedItemId,
    name: l.name,
    quantity: l.quantity,
    mode: 'in',
    unitCost: l.unitCost,
    expiresOn: l.expiresOn,
    confidence: 'high',
    note: l.unit,
    include: l.quantity > 0,
  }));
}

export function fromVoice(r: VoiceResult): ReviewRow[] {
  return r.operations.map((op, i) => ({
    key: `v${i}`,
    matchedItemId: op.matchedItemId,
    name: op.name,
    quantity: op.quantity,
    mode: op.kind,
    unitCost: null,
    expiresOn: null,
    confidence: 'high',
    note: null,
    include: op.quantity > 0,
  }));
}

/** Apply the ticked rows. Returns how many rows were skipped by the plan's item limit. */
export async function applyReview(
  db: SQLiteDatabase,
  review: PendingReview,
  opts: { plan: Plan; defaultUnit: string },
): Promise<{ applied: number; blocked: number }> {
  let applied = 0;
  let blocked = 0;
  let itemCount = await countItems(db);
  for (const row of review.rows) {
    if (!row.include || !Number.isFinite(row.quantity) || row.quantity < 0) continue;
    let itemId = row.matchedItemId;
    if (!itemId) {
      if (!canAddItem(opts.plan, itemCount)) {
        blocked += 1;
        continue;
      }
      itemId = await createItem(db, {
        name: row.name,
        unit: opts.defaultUnit,
        supplier: review.supplier,
        unitCost: row.unitCost,
      });
      itemCount += 1;
    }
    if (row.mode === 'count') await recordCount(db, itemId, row.quantity, review.source);
    else
      await recordMovement(db, {
        itemId,
        delta: row.mode === 'in' ? row.quantity : -row.quantity,
        kind: row.mode,
        source: review.source,
        expiresOn: row.expiresOn,
        unitCost: row.unitCost,
      });
    applied += 1;
  }
  return { applied, blocked };
}
