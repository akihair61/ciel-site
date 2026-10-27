/**
 * Currency metadata. `scale` = ISO 4217 minor unit digits.
 * Source of truth for scale is ISO 4217 (list one). Values here are the
 * commonly published ones; verify against the ISO list before adding more
 * (docs/TECH_VALIDATION.md).
 */
export interface CurrencyMeta {
  readonly code: string;
  readonly numeric: number;
  readonly scale: number;
  readonly symbol: string;
  readonly name: { readonly ja: string; readonly en: string };
  /** Smallest physical cash step in minor units, when it differs from 1 (e.g. CHF 0.05). */
  readonly cashStepMinor?: number;
}

export class UnknownCurrencyError extends Error {
  readonly code = "CURRENCY_UNKNOWN";
  constructor(code: string) {
    super(`unknown currency: ${code}`);
    this.name = "UnknownCurrencyError";
  }
}

const list: CurrencyMeta[] = [
  { code: "JPY", numeric: 392, scale: 0, symbol: "¥", name: { ja: "日本円", en: "Japanese yen" } },
  { code: "THB", numeric: 764, scale: 2, symbol: "฿", name: { ja: "タイバーツ", en: "Thai baht" } },
  { code: "USD", numeric: 840, scale: 2, symbol: "$", name: { ja: "米ドル", en: "US dollar" } },
  { code: "EUR", numeric: 978, scale: 2, symbol: "€", name: { ja: "ユーロ", en: "Euro" } },
  { code: "GBP", numeric: 826, scale: 2, symbol: "£", name: { ja: "英ポンド", en: "Pound sterling" } },
  { code: "KRW", numeric: 410, scale: 0, symbol: "₩", name: { ja: "韓国ウォン", en: "South Korean won" } },
  { code: "TWD", numeric: 901, scale: 2, symbol: "NT$", name: { ja: "台湾ドル", en: "New Taiwan dollar" } },
  { code: "CNY", numeric: 156, scale: 2, symbol: "元", name: { ja: "人民元", en: "Chinese yuan" } },
  { code: "HKD", numeric: 344, scale: 2, symbol: "HK$", name: { ja: "香港ドル", en: "Hong Kong dollar" } },
  { code: "SGD", numeric: 702, scale: 2, symbol: "S$", name: { ja: "シンガポールドル", en: "Singapore dollar" } },
  { code: "MYR", numeric: 458, scale: 2, symbol: "RM", name: { ja: "マレーシアリンギット", en: "Malaysian ringgit" } },
  { code: "IDR", numeric: 360, scale: 2, symbol: "Rp", name: { ja: "インドネシアルピア", en: "Indonesian rupiah" } },
  { code: "PHP", numeric: 608, scale: 2, symbol: "₱", name: { ja: "フィリピンペソ", en: "Philippine peso" } },
  { code: "VND", numeric: 704, scale: 0, symbol: "₫", name: { ja: "ベトナムドン", en: "Vietnamese dong" } },
  { code: "LAK", numeric: 418, scale: 2, symbol: "₭", name: { ja: "ラオスキープ", en: "Lao kip" } },
  { code: "KHR", numeric: 116, scale: 2, symbol: "៛", name: { ja: "カンボジアリエル", en: "Cambodian riel" } },
  { code: "MMK", numeric: 104, scale: 2, symbol: "K", name: { ja: "ミャンマーチャット", en: "Myanmar kyat" } },
  { code: "INR", numeric: 356, scale: 2, symbol: "₹", name: { ja: "インドルピー", en: "Indian rupee" } },
  { code: "AUD", numeric: 36, scale: 2, symbol: "A$", name: { ja: "豪ドル", en: "Australian dollar" } },
  { code: "NZD", numeric: 554, scale: 2, symbol: "NZ$", name: { ja: "NZドル", en: "New Zealand dollar" } },
  { code: "CAD", numeric: 124, scale: 2, symbol: "C$", name: { ja: "カナダドル", en: "Canadian dollar" } },
  { code: "CHF", numeric: 756, scale: 2, symbol: "Fr", name: { ja: "スイスフラン", en: "Swiss franc" }, cashStepMinor: 5 },
  { code: "SEK", numeric: 752, scale: 2, symbol: "kr", name: { ja: "スウェーデンクローナ", en: "Swedish krona" } },
  { code: "NOK", numeric: 578, scale: 2, symbol: "kr", name: { ja: "ノルウェークローネ", en: "Norwegian krone" } },
  { code: "DKK", numeric: 208, scale: 2, symbol: "kr", name: { ja: "デンマーククローネ", en: "Danish krone" } },
  { code: "CZK", numeric: 203, scale: 2, symbol: "Kč", name: { ja: "チェココルナ", en: "Czech koruna" } },
  { code: "PLN", numeric: 985, scale: 2, symbol: "zł", name: { ja: "ポーランドズロチ", en: "Polish zloty" } },
  { code: "HUF", numeric: 348, scale: 2, symbol: "Ft", name: { ja: "ハンガリーフォリント", en: "Hungarian forint" } },
  { code: "ISK", numeric: 352, scale: 0, symbol: "kr", name: { ja: "アイスランドクローナ", en: "Icelandic króna" } },
  { code: "TRY", numeric: 949, scale: 2, symbol: "₺", name: { ja: "トルコリラ", en: "Turkish lira" } },
  { code: "AED", numeric: 784, scale: 2, symbol: "Dh", name: { ja: "UAEディルハム", en: "UAE dirham" } },
  { code: "SAR", numeric: 682, scale: 2, symbol: "SR", name: { ja: "サウジリヤル", en: "Saudi riyal" } },
  { code: "KWD", numeric: 414, scale: 3, symbol: "KD", name: { ja: "クウェートディナール", en: "Kuwaiti dinar" } },
  { code: "BHD", numeric: 48, scale: 3, symbol: "BD", name: { ja: "バーレーンディナール", en: "Bahraini dinar" } },
  { code: "OMR", numeric: 512, scale: 3, symbol: "RO", name: { ja: "オマーンリアル", en: "Omani rial" } },
  { code: "JOD", numeric: 400, scale: 3, symbol: "JD", name: { ja: "ヨルダンディナール", en: "Jordanian dinar" } },
  { code: "MXN", numeric: 484, scale: 2, symbol: "Mex$", name: { ja: "メキシコペソ", en: "Mexican peso" } },
  { code: "BRL", numeric: 986, scale: 2, symbol: "R$", name: { ja: "ブラジルレアル", en: "Brazilian real" } },
  { code: "CLP", numeric: 152, scale: 0, symbol: "CLP$", name: { ja: "チリペソ", en: "Chilean peso" } },
  { code: "ZAR", numeric: 710, scale: 2, symbol: "R", name: { ja: "南アフリカランド", en: "South African rand" } },
  { code: "EGP", numeric: 818, scale: 2, symbol: "E£", name: { ja: "エジプトポンド", en: "Egyptian pound" } },
  { code: "LKR", numeric: 144, scale: 2, symbol: "Rs", name: { ja: "スリランカルピー", en: "Sri Lankan rupee" } },
  { code: "NPR", numeric: 524, scale: 2, symbol: "Rs", name: { ja: "ネパールルピー", en: "Nepalese rupee" } },
];

export const CURRENCIES: ReadonlyMap<string, CurrencyMeta> = new Map(list.map((c) => [c.code, c]));

export function currency(code: string): CurrencyMeta {
  const c = CURRENCIES.get(code);
  if (!c) throw new UnknownCurrencyError(code);
  return c;
}

export function isKnownCurrency(code: string): boolean {
  return CURRENCIES.has(code);
}

export function allCurrencyCodes(): string[] {
  return [...CURRENCIES.keys()];
}
