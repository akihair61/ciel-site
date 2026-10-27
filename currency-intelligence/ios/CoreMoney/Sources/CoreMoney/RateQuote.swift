// 未ビルド: コンパイル未確認(Linux 環境に Swift なし)。
import Foundation

public enum RateKind: String, Codable, Sendable {
    case mid, bid, ask, indicative, cashBuy = "cash_buy", cashSell = "cash_sell", card, atm, userRealized = "user_realized"
}

public enum Confidence: String, Codable, Sendable { case confirmed, estimated }

/// Mirrors RateQuote in packages/core/src/rates.ts. `rate` stays a String so
/// Decimal parsing is explicit and locale-independent.
public struct RateQuote: Codable, Hashable, Sendable {
    public let quoteId: String
    public let base: String
    public let quote: String
    public let rate: String
    public let bid: String?
    public let ask: String?
    public let mid: String?
    public let source: String
    public let observedAt: Date
    public let receivedAt: Date
    public let expiresAt: Date?
    public let rateKind: RateKind
    public let confidence: Confidence
    public let jurisdiction: String?
    public let derivedFrom: [String]?
    public let notes: [String]?

    public init(quoteId: String, base: String, quote: String, rate: String, bid: String? = nil, ask: String? = nil, mid: String? = nil,
                source: String, observedAt: Date, receivedAt: Date, expiresAt: Date? = nil, rateKind: RateKind, confidence: Confidence,
                jurisdiction: String? = nil, derivedFrom: [String]? = nil, notes: [String]? = nil) {
        self.quoteId = quoteId; self.base = base; self.quote = quote; self.rate = rate; self.bid = bid; self.ask = ask; self.mid = mid
        self.source = source; self.observedAt = observedAt; self.receivedAt = receivedAt; self.expiresAt = expiresAt
        self.rateKind = rateKind; self.confidence = confidence; self.jurisdiction = jurisdiction; self.derivedFrom = derivedFrom; self.notes = notes
    }

    public var rateDecimal: Decimal? { Decimal(string: rate, locale: Locale(identifier: "en_US_POSIX")) }

    public enum Staleness { case fresh, stale, expired }

    public func staleness(now: Date, ttl: TimeInterval) -> Staleness {
        if let exp = expiresAt, now > exp { return .expired }
        return now.timeIntervalSince(observedAt) <= ttl ? .fresh : .stale
    }
}

public struct ConversionResult: Sendable {
    public let originalAmount: Money
    public let convertedAmount: Money
    public let rate: String
    public let quoteId: String
    public let roundingMode: RoundingMode
    public let estimated: Bool
}

public enum ConversionError: Error { case baseMismatch, negativeAmount, badRate, sameCurrency }

public enum Converter {
    /// amount (quote.base) → quote.quote at quote.rate, rounded once to the target scale.
    public static func convert(_ amount: Money, quote: RateQuote, rounding: RoundingMode) throws -> ConversionResult {
        guard amount.currency == quote.base else { throw ConversionError.baseMismatch }
        guard amount.minor >= 0 else { throw ConversionError.negativeAmount }
        guard quote.base != quote.quote else { throw ConversionError.sameCurrency }
        guard let r = quote.rateDecimal, r > 0 else { throw ConversionError.badRate }
        let target = try Currencies.meta(quote.quote)
        let gross = amount.decimalValue * r * Money.pow10(target.scale) // target minor units, unrounded
        let rounded = Money.round(gross, places: 0, mode: rounding)
        guard let m = Int64("\(rounded)") else { throw MoneyError.overflow }
        return ConversionResult(
            originalAmount: amount,
            convertedAmount: try Money(minor: m, currency: target.code),
            rate: quote.rate,
            quoteId: quote.quoteId,
            roundingMode: rounding,
            estimated: quote.confidence == .estimated
        )
    }
}
