import type { IndustryId } from './types';

export interface IndustryProfile {
  id: IndustryId;
  /** Lots with expiry dates are tracked and consumed first-expiring-first-out. */
  tracksExpiry: boolean;
  /** Items carry a size / colour variant. */
  usesVariants: boolean;
  defaultUnit: string;
  /** Days of stock a reorder should cover beyond the lead time. */
  reviewDays: number;
  /** Days before expiry that an item is flagged. */
  expiryWarnDays: number;
  categories: string[];
}

export const INDUSTRIES: Record<IndustryId, IndustryProfile> = {
  food: {
    id: 'food',
    tracksExpiry: true,
    usesVariants: false,
    defaultUnit: 'kg',
    reviewDays: 3,
    expiryWarnDays: 3,
    categories: ['produce', 'meat_fish', 'dairy', 'dry_goods', 'drinks', 'packaging'],
  },
  salon: {
    id: 'salon',
    tracksExpiry: true,
    usesVariants: false,
    defaultUnit: 'pcs',
    reviewDays: 14,
    expiryWarnDays: 30,
    categories: ['color', 'perm', 'treatment', 'shampoo', 'retail_products', 'consumables'],
  },
  retail: {
    id: 'retail',
    tracksExpiry: false,
    usesVariants: false,
    defaultUnit: 'pcs',
    reviewDays: 14,
    expiryWarnDays: 30,
    categories: ['accessories', 'stationery', 'gifts', 'household'],
  },
  fashion: {
    id: 'fashion',
    tracksExpiry: false,
    usesVariants: true,
    defaultUnit: 'pcs',
    reviewDays: 21,
    expiryWarnDays: 30,
    categories: ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories'],
  },
  pharmacy: {
    id: 'pharmacy',
    tracksExpiry: true,
    usesVariants: true,
    defaultUnit: 'box',
    reviewDays: 14,
    expiryWarnDays: 60,
    categories: ['otc', 'prescription', 'supplements', 'first_aid', 'cosmetics'],
  },
  other: {
    id: 'other',
    tracksExpiry: true,
    usesVariants: true,
    defaultUnit: 'pcs',
    reviewDays: 14,
    expiryWarnDays: 14,
    categories: [],
  },
};

export const INDUSTRY_IDS = Object.keys(INDUSTRIES) as IndustryId[];
