// 未ビルド: コンパイル未確認(この作業環境に Swift なし)。macOS で `swift test` を実行してください(ios/README_MAC.md)。
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
    /// nil when the provider publishes no observation time (Coinbase). UI must say so and never show receivedAt as the observation time.
    public let observedAt: Date?
    public let receivedAt: Date
    public let expiresAt: Date?
    public let rateKind: RateKind
    public let confidence: Confidence
    public let jurisdiction: String?
    public let derivedFrom: [String]?
    public let notes: [String]?

    public init(quoteId: String, base: String, quote: String, rate: String, bid: String? = nil, ask: String? = nil, mid: String? = nil,
                source: String, observedAt: Date?, receivedAt: Date, expiresAt: Date? = nil, rateKind: RateKind, confidence: Confidence,
                jurisdiction: String? = nil, derivedFrom: [String]? = nil, notes: [String]? = nil) {
        self.quoteId = quoteId; self.base = base; self.quote = quote; self.rate = rate; self.bid = bid; self.ask = ask; self.mid = mid
        self.source = source; self.observedAt = observedAt; self.receivedAt = receivedAt; self.expiresAt = expiresAt
        self.rateKind = rateKind; self.confidence = confidence; self.jurisdiction = jurisdiction; self.derivedFrom = derivedFrom; self.notes = notes
    }

    public var rateDecimal: Decimal? { Decimal(string: rate, locale: Locale(identifier: "en_US_POSIX")) }

    public enum Staleness { case fresh, stale, expired }
    public enum AgeBasis { case observedAt, receivedAt }

    /// Age is measured from observedAt when known, else from receivedAt (basis tells which).
    public func staleness(now: Date, ttl: TimeInterval) -> (status: Staleness, age: TimeInterval, basis: AgeBasis) {
        let basis: AgeBasis = observedAt == nil ? .receivedAt : .observedAt
        let age = max(0, now.timeIntervalSince(observedAt ?? receivedAt))
        if let exp = expiresAt, now > exp { return (.expired, age, basis) }
        return (age <= ttl ? .fresh : .stale, age, basis)
    }

    /// quote→base. Derived rate keeps 12 fraction digits, half-even.
    public func inverted() -> RateQuote? {
        guard let r = rateDecimal, r > 0 else { return nil }
        let inv = Money.round(Decimal(1) / r, places: 12, mode: .halfEven)
        return RateQuote(quoteId: quoteId + ":inv", base: quote, quote: base, rate: "\(inv)", bid: ask, ask: bid, mid: mid, source: source,
                         observedAt: observedAt, receivedAt: receivedAt, expiresAt: expiresAt,
                         rateKind: rateKind == .bid ? .ask : rateKind == .ask ? .bid : rateKind, confidence: confidence,
                         jurisdiction: jurisdiction, derivedFrom: [quoteId], notes: (notes ?? []) + ["inverted"])
    }

    /// Cross X→Y from C→X and C→Y. Unknown observation time on either leg marks the result estimated.
    public static func cross(_ cToX: RateQuote, _ cToY: RateQuote, tolerance: TimeInterval) -> RateQuote? {
        guard cToX.base == cToY.base, cToX.quote != cToY.quote, let rx = cToX.rateDecimal, let ry = cToY.rateDecimal, rx > 0 else { return nil }
        let timeKnown = cToX.observedAt != nil && cToY.observedAt != nil
        let tX = cToX.observedAt ?? cToX.receivedAt, tY = cToY.observedAt ?? cToY.receivedAt
        let skew = abs(tX.timeIntervalSince(tY))
        let out = !timeKnown || skew > tolerance
        let rate = Money.round(ry / rx, places: 12, mode: .halfEven)
        var notes = ["cross via \(cToX.base)"]
        if !timeKnown { notes.append("observation time unknown for at least one leg; marked estimated") }
        else if out { notes.append("observation skew \(Int(skew))s exceeds tolerance") }
        return RateQuote(quoteId: cToX.quoteId + "x" + cToY.quoteId, base: cToX.quote, quote: cToY.quote, rate: "\(rate)",
                         source: cToX.source == cToY.source ? cToX.source : cToX.source + "+" + cToY.source,
                         observedAt: timeKnown ? min(tX, tY) : nil, receivedAt: max(cToX.receivedAt, cToY.receivedAt),
                         expiresAt: [cToX.expiresAt, cToY.expiresAt].compactMap { $0 }.min(),
                         rateKind: cToX.rateKind == cToY.rateKind ? cToX.rateKind : .indicative,
                         confidence: (out || cToX.confidence == .estimated || cToY.confidence == .estimated) ? .estimated : .confirmed,
                         derivedFrom: [cToX.quoteId, cToY.quoteId], notes: notes)
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
