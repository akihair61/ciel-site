/**
 * Per-device monthly AI quota. Uses a KV namespace when bound (Cloudflare),
 * otherwise an in-memory map (local dev only — resets on restart).
 */

export interface QuotaStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export class MemoryStore implements QuotaStore {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
}

export const LIMITS: Record<string, number> = { free: 20, pro: 600, business: 3000 };

/**
 * Returns false when the device is over its limit. Not atomic under heavy
 * concurrency, which is acceptable for a soft per-device cap.
 */
export async function consume(store: QuotaStore, deviceId: string, plan: string, now = new Date()): Promise<boolean> {
  const key = `q:${now.toISOString().slice(0, 7)}:${deviceId}`;
  const used = Number((await store.get(key)) ?? 0);
  if (used >= (LIMITS[plan] ?? LIMITS.free)) return false;
  await store.put(key, String(used + 1), { expirationTtl: 40 * 86_400 });
  return true;
}
