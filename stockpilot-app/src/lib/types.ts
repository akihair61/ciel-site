export type IndustryId = 'food' | 'salon' | 'retail' | 'fashion' | 'pharmacy' | 'other';

export type MovementKind = 'in' | 'out' | 'adjust' | 'count';
export type MovementSource = 'manual' | 'barcode' | 'voice' | 'shelf_ai' | 'invoice_ai';

export interface Item {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  /** Size / colour etc. for fashion, strength for pharmacy. */
  variant: string | null;
  unit: string;
  quantity: number;
  reorderPoint: number;
  leadTimeDays: number;
  unitCost: number | null;
  supplier: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lot {
  id: string;
  itemId: string;
  quantity: number;
  /** YYYY-MM-DD, null when the lot has no expiry. */
  expiresOn: string | null;
  receivedAt: string;
}

export interface Movement {
  id: string;
  itemId: string;
  delta: number;
  kind: MovementKind;
  source: MovementSource;
  note: string | null;
  createdAt: string;
}

/** The minimal view of an item the AI server needs to match against. */
export interface KnownItem {
  id: string;
  name: string;
  unit: string;
  variant: string | null;
}
