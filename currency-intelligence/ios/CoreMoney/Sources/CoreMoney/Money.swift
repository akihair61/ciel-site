// CoreMoney — Swift mirror of packages/core (TypeScript). Same rules:
// integer minor units, explicit rounding, no Double in money paths.
// 未ビルド: Linux 環境に Swift ツールチェーンがないため、このファイルはコンパイル未確認です。
import Foundation

public enum MoneyError: Error, Equatable {
    case unknownCurrency(String)
    case currencyMismatch(String, String)
    case precision(String)
    case overflow
    case invalidDecimal(String)
    case allocation(String)
}

public struct CurrencyMeta: Hashable, Sendable {
    public let code: String
    public let numeric: Int
    public let scale: Int
    public let symbol: String
    public let nameJa: String
    public let nameEn: String
    public let cashStepMinor: Int?

    public init(code: String, numeric: Int, scale: Int, symbol: String, nameJa: String, nameEn: String, cashStepMinor: Int? = nil) {
        self.code = code; self.numeric = numeric; self.scale = scale; self.symbol = symbol
        self.nameJa = nameJa; self.nameEn = nameEn; self.cashStepMinor = cashStepMinor
    }
}

/// Mirrors packages/core/src/currencies.ts (same 43 codes and scales).
public enum Currencies {
    /// Generated from packages/core/src/currencies.ts (43 currencies). Scale = ISO 4217 minor units.
    public static let all: [String: CurrencyMeta] = [
        "JPY": .init(code: "JPY", numeric: 392, scale: 0, symbol: "¥", nameJa: "日本円", nameEn: "Japanese yen"),
        "THB": .init(code: "THB", numeric: 764, scale: 2, symbol: "฿", nameJa: "タイバーツ", nameEn: "Thai baht"),
        "USD": .init(code: "USD", numeric: 840, scale: 2, symbol: "$", nameJa: "米ドル", nameEn: "US dollar"),
        "EUR": .init(code: "EUR", numeric: 978, scale: 2, symbol: "€", nameJa: "ユーロ", nameEn: "Euro"),
        "GBP": .init(code: "GBP", numeric: 826, scale: 2, symbol: "£", nameJa: "英ポンド", nameEn: "Pound sterling"),
        "KRW": .init(code: "KRW", numeric: 410, scale: 0, symbol: "₩", nameJa: "韓国ウォン", nameEn: "South Korean won"),
        "TWD": .init(code: "TWD", numeric: 901, scale: 2, symbol: "NT$", nameJa: "台湾ドル", nameEn: "New Taiwan dollar"),
        "CNY": .init(code: "CNY", numeric: 156, scale: 2, symbol: "元", nameJa: "人民元", nameEn: "Chinese yuan"),
        "HKD": .init(code: "HKD", numeric: 344, scale: 2, symbol: "HK$", nameJa: "香港ドル", nameEn: "Hong Kong dollar"),
        "SGD": .init(code: "SGD", numeric: 702, scale: 2, symbol: "S$", nameJa: "シンガポールドル", nameEn: "Singapore dollar"),
        "MYR": .init(code: "MYR", numeric: 458, scale: 2, symbol: "RM", nameJa: "マレーシアリンギット", nameEn: "Malaysian ringgit"),
        "IDR": .init(code: "IDR", numeric: 360, scale: 2, symbol: "Rp", nameJa: "インドネシアルピア", nameEn: "Indonesian rupiah"),
        "PHP": .init(code: "PHP", numeric: 608, scale: 2, symbol: "₱", nameJa: "フィリピンペソ", nameEn: "Philippine peso"),
        "VND": .init(code: "VND", numeric: 704, scale: 0, symbol: "₫", nameJa: "ベトナムドン", nameEn: "Vietnamese dong"),
        "LAK": .init(code: "LAK", numeric: 418, scale: 2, symbol: "₭", nameJa: "ラオスキープ", nameEn: "Lao kip"),
        "KHR": .init(code: "KHR", numeric: 116, scale: 2, symbol: "៛", nameJa: "カンボジアリエル", nameEn: "Cambodian riel"),
        "MMK": .init(code: "MMK", numeric: 104, scale: 2, symbol: "K", nameJa: "ミャンマーチャット", nameEn: "Myanmar kyat"),
        "INR": .init(code: "INR", numeric: 356, scale: 2, symbol: "₹", nameJa: "インドルピー", nameEn: "Indian rupee"),
        "AUD": .init(code: "AUD", numeric: 36, scale: 2, symbol: "A$", nameJa: "豪ドル", nameEn: "Australian dollar"),
        "NZD": .init(code: "NZD", numeric: 554, scale: 2, symbol: "NZ$", nameJa: "NZドル", nameEn: "New Zealand dollar"),
        "CAD": .init(code: "CAD", numeric: 124, scale: 2, symbol: "C$", nameJa: "カナダドル", nameEn: "Canadian dollar"),
        "CHF": .init(code: "CHF", numeric: 756, scale: 2, symbol: "Fr", nameJa: "スイスフラン", nameEn: "Swiss franc", cashStepMinor: 5),
        "SEK": .init(code: "SEK", numeric: 752, scale: 2, symbol: "kr", nameJa: "スウェーデンクローナ", nameEn: "Swedish krona"),
        "NOK": .init(code: "NOK", numeric: 578, scale: 2, symbol: "kr", nameJa: "ノルウェークローネ", nameEn: "Norwegian krone"),
        "DKK": .init(code: "DKK", numeric: 208, scale: 2, symbol: "kr", nameJa: "デンマーククローネ", nameEn: "Danish krone"),
        "CZK": .init(code: "CZK", numeric: 203, scale: 2, symbol: "Kč", nameJa: "チェココルナ", nameEn: "Czech koruna"),
        "PLN": .init(code: "PLN", numeric: 985, scale: 2, symbol: "zł", nameJa: "ポーランドズロチ", nameEn: "Polish zloty"),
        "HUF": .init(code: "HUF", numeric: 348, scale: 2, symbol: "Ft", nameJa: "ハンガリーフォリント", nameEn: "Hungarian forint"),
        "ISK": .init(code: "ISK", numeric: 352, scale: 0, symbol: "kr", nameJa: "アイスランドクローナ", nameEn: "Icelandic króna"),
        "TRY": .init(code: "TRY", numeric: 949, scale: 2, symbol: "₺", nameJa: "トルコリラ", nameEn: "Turkish lira"),
        "AED": .init(code: "AED", numeric: 784, scale: 2, symbol: "Dh", nameJa: "UAEディルハム", nameEn: "UAE dirham"),
        "SAR": .init(code: "SAR", numeric: 682, scale: 2, symbol: "SR", nameJa: "サウジリヤル", nameEn: "Saudi riyal"),
        "KWD": .init(code: "KWD", numeric: 414, scale: 3, symbol: "KD", nameJa: "クウェートディナール", nameEn: "Kuwaiti dinar"),
        "BHD": .init(code: "BHD", numeric: 48, scale: 3, symbol: "BD", nameJa: "バーレーンディナール", nameEn: "Bahraini dinar"),
        "OMR": .init(code: "OMR", numeric: 512, scale: 3, symbol: "RO", nameJa: "オマーンリアル", nameEn: "Omani rial"),
        "JOD": .init(code: "JOD", numeric: 400, scale: 3, symbol: "JD", nameJa: "ヨルダンディナール", nameEn: "Jordanian dinar"),
        "MXN": .init(code: "MXN", numeric: 484, scale: 2, symbol: "Mex$", nameJa: "メキシコペソ", nameEn: "Mexican peso"),
        "BRL": .init(code: "BRL", numeric: 986, scale: 2, symbol: "R$", nameJa: "ブラジルレアル", nameEn: "Brazilian real"),
        "CLP": .init(code: "CLP", numeric: 152, scale: 0, symbol: "CLP$", nameJa: "チリペソ", nameEn: "Chilean peso"),
        "ZAR": .init(code: "ZAR", numeric: 710, scale: 2, symbol: "R", nameJa: "南アフリカランド", nameEn: "South African rand"),
        "EGP": .init(code: "EGP", numeric: 818, scale: 2, symbol: "E£", nameJa: "エジプトポンド", nameEn: "Egyptian pound"),
        "LKR": .init(code: "LKR", numeric: 144, scale: 2, symbol: "Rs", nameJa: "スリランカルピー", nameEn: "Sri Lankan rupee"),
        "NPR": .init(code: "NPR", numeric: 524, scale: 2, symbol: "Rs", nameJa: "ネパールルピー", nameEn: "Nepalese rupee"),
    ]

    public static func meta(_ code: String) throws -> CurrencyMeta {
        guard let m = all[code] else { throw MoneyError.unknownCurrency(code) }
        return m
    }
}

public enum RoundingMode: String, CaseIterable, Sendable {
    case halfUp = "HALF_UP", halfDown = "HALF_DOWN", halfEven = "HALF_EVEN"
    case up = "UP", down = "DOWN", ceiling = "CEILING", floor = "FLOOR"

    var nsMode: NSDecimalNumber.RoundingMode {
        switch self {
        case .halfUp: return .plain      // NSDecimal .plain = half away from zero
        case .halfEven: return .bankers
        case .down: return .down         // toward zero? NSDecimalNumber .down rounds toward negative infinity for negatives — handled in Money.round
        case .up: return .up
        case .ceiling: return .up
        case .floor: return .down
        case .halfDown: return .plain    // approximated; corrected in Money.round
        }
    }
}

/// Immutable money in integer minor units. Int64 covers ±9.2e18 minor units.
public struct Money: Hashable, Sendable, CustomStringConvertible {
    public let currency: String
    public let minor: Int64
    public let scale: Int

    public static let maxMinor: Int64 = 1_000_000_000_000_000_000 // 1e18, below Int64.max

    public init(minor: Int64, currency: String) throws {
        let meta = try Currencies.meta(currency)
        guard minor.magnitude <= UInt64(Money.maxMinor) else { throw MoneyError.overflow }
        self.currency = meta.code
        self.minor = minor
        self.scale = meta.scale
    }

    /// Parse "1234.56". Extra fraction digits throw unless a rounding mode is given.
    public init(_ amount: String, currency: String, rounding: RoundingMode? = nil) throws {
        let meta = try Currencies.meta(currency)
        guard let d = Decimal(string: amount, locale: Locale(identifier: "en_US_POSIX")), amount.range(of: #"^[+-]?\d+(\.\d+)?$"#, options: .regularExpression) != nil else {
            throw MoneyError.invalidDecimal(amount)
        }
        let scaled = d * Money.pow10(meta.scale)
        let rounded = Money.round(scaled, places: 0, mode: rounding ?? .down)
        if rounding == nil && rounded != scaled { throw MoneyError.precision(amount) }
        guard let m = Int64(exactly: NSDecimalNumber(decimal: rounded).doubleValue), Decimal(m) == rounded else {
            // doubleValue is only a fast path; the equality check guards exactness, then fall back to string parsing.
            guard let m2 = Int64("\(rounded)") else { throw MoneyError.overflow }
            try self.init(minor: m2, currency: meta.code)
            return
        }
        try self.init(minor: m, currency: meta.code)
    }

    static func pow10(_ n: Int) -> Decimal { Decimal(sign: .plus, exponent: n, significand: 1) }

    /// Rounding with java.math.RoundingMode semantics on top of NSDecimalNumber.
    static func round(_ d: Decimal, places: Int, mode: RoundingMode) -> Decimal {
        var value = d
        var result = Decimal()
        let negative = d < 0
        switch mode {
        case .halfUp:
            NSDecimalRound(&result, &value, places, .plain)
        case .halfEven:
            NSDecimalRound(&result, &value, places, .bankers)
        case .down:
            NSDecimalRound(&result, &value, places, negative ? .up : .down)
        case .up:
            NSDecimalRound(&result, &value, places, negative ? .down : .up)
        case .ceiling:
            NSDecimalRound(&result, &value, places, .up)
        case .floor:
            NSDecimalRound(&result, &value, places, .down)
        case .halfDown:
            // half-down = half-up applied to (|x| - epsilon). Use bankers then fix exact halves.
            var truncated = Decimal()
            NSDecimalRound(&truncated, &value, places, negative ? .up : .down)
            let diff = (value - truncated).magnitude
            let half = Decimal(sign: .plus, exponent: -places - 1, significand: 5)
            if diff > half {
                result = truncated + (negative ? -1 : 1) * Decimal(sign: .plus, exponent: -places, significand: 1)
            } else {
                result = truncated
            }
        }
        return result
    }

    public var decimalValue: Decimal { Decimal(minor) / Money.pow10(scale) }

    public func add(_ other: Money) throws -> Money {
        guard other.currency == currency else { throw MoneyError.currencyMismatch(currency, other.currency) }
        return try Money(minor: minor + other.minor, currency: currency)
    }

    public func subtract(_ other: Money) throws -> Money {
        guard other.currency == currency else { throw MoneyError.currencyMismatch(currency, other.currency) }
        return try Money(minor: minor - other.minor, currency: currency)
    }

    /// Multiply by a decimal factor with explicit rounding to the currency scale.
    public func multiply(_ factor: Decimal, rounding: RoundingMode) throws -> Money {
        let product = Decimal(minor) * factor // still in minor units
        let rounded = Money.round(product, places: 0, mode: rounding)
        guard let m = Int64("\(rounded)") else { throw MoneyError.overflow }
        return try Money(minor: m, currency: currency)
    }

    /// Largest-remainder allocation. Invariant: sum == self. Ties go to earlier indices.
    public func allocate(_ weights: [Int]) throws -> [Money] {
        guard !weights.isEmpty, weights.allSatisfy({ $0 >= 0 }) else { throw MoneyError.allocation("weights") }
        let total = weights.reduce(0, +)
        guard total > 0 else { throw MoneyError.allocation("zero weights") }
        let sign: Int64 = minor < 0 ? -1 : 1
        let abs = minor.magnitude
        var base = weights.map { Int64(abs * UInt64($0) / UInt64(total)) }
        let rem = weights.enumerated().map { (i: $0.offset, r: abs * UInt64($0.element) % UInt64(total)) }
            .sorted { $0.r == $1.r ? $0.i < $1.i : $0.r > $1.r }
        var left = Int64(abs) - base.reduce(0, +)
        for item in rem where left > 0 {
            base[item.i] += 1
            left -= 1
        }
        return try base.map { try Money(minor: $0 * sign, currency: currency) }
    }

    public var description: String { "\(currency) \(decimalString)" }

    /// Exact decimal string with the currency's scale, e.g. "1234.50".
    public var decimalString: String {
        let neg = minor < 0
        var digits = String(minor.magnitude)
        if scale == 0 { return (neg ? "-" : "") + digits }
        if digits.count <= scale { digits = String(repeating: "0", count: scale + 1 - digits.count) + digits }
        let idx = digits.index(digits.endIndex, offsetBy: -scale)
        return (neg ? "-" : "") + digits[..<idx] + "." + digits[idx...]
    }
}
