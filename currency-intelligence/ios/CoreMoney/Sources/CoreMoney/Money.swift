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

/// Subset of ISO 4217. Keep in sync with packages/core/src/currencies.ts.
public enum Currencies {
    public static let all: [String: CurrencyMeta] = [
        "JPY": .init(code: "JPY", numeric: 392, scale: 0, symbol: "¥", nameJa: "日本円", nameEn: "Japanese yen"),
        "THB": .init(code: "THB", numeric: 764, scale: 2, symbol: "฿", nameJa: "タイバーツ", nameEn: "Thai baht"),
        "USD": .init(code: "USD", numeric: 840, scale: 2, symbol: "$", nameJa: "米ドル", nameEn: "US dollar"),
        "EUR": .init(code: "EUR", numeric: 978, scale: 2, symbol: "€", nameJa: "ユーロ", nameEn: "Euro"),
        "GBP": .init(code: "GBP", numeric: 826, scale: 2, symbol: "£", nameJa: "英ポンド", nameEn: "Pound sterling"),
        "KRW": .init(code: "KRW", numeric: 410, scale: 0, symbol: "₩", nameJa: "韓国ウォン", nameEn: "South Korean won"),
        "TWD": .init(code: "TWD", numeric: 901, scale: 2, symbol: "NT$", nameJa: "台湾ドル", nameEn: "New Taiwan dollar"),
        "VND": .init(code: "VND", numeric: 704, scale: 0, symbol: "₫", nameJa: "ベトナムドン", nameEn: "Vietnamese dong"),
        "SGD": .init(code: "SGD", numeric: 702, scale: 2, symbol: "S$", nameJa: "シンガポールドル", nameEn: "Singapore dollar"),
        "CHF": .init(code: "CHF", numeric: 756, scale: 2, symbol: "Fr", nameJa: "スイスフラン", nameEn: "Swiss franc", cashStepMinor: 5),
        "KWD": .init(code: "KWD", numeric: 414, scale: 3, symbol: "KD", nameJa: "クウェートディナール", nameEn: "Kuwaiti dinar"),
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
