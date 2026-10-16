import type { Lot } from './types';

export interface LotChange {
  id: string;
  quantity: number;
}

/**
 * Take `amount` out of lots, first-expiring-first-out (undated lots last,
 * oldest received first). Returns the new quantity for every lot touched and
 * any shortfall that no lot could cover.
 */
export function consumeFefo(lots: Lot[], amount: number): { changes: LotChange[]; shortfall: number } {
  const ordered = [...lots]
    .filter((l) => l.quantity > 0)
    .sort((a, b) => {
      if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
      if (a.expiresOn) return -1;
      if (b.expiresOn) return 1;
      return a.receivedAt.localeCompare(b.receivedAt);
    });

  let remaining = amount;
  const changes: LotChange[] = [];
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    remaining -= take;
    changes.push({ id: lot.id, quantity: lot.quantity - take });
  }
  return { changes, shortfall: Math.max(0, remaining) };
}
