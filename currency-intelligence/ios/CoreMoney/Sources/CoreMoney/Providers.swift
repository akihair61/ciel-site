// 未ビルド: macOS で `swift test` を実行して確認してください(ios/README_MAC.md)。
import Foundation

/// Coinbase public exchange rates. Rates arrive as JSON *strings*, so Decimal(string:) keeps every digit
/// (no double in between). The payload carries no observation time → observedAt = nil (spec 02 Q-02).
public struct CoinbaseProvider: Sendable {
    public let id = "coinbase"
    public let baseURL: URL
    public init(baseURL: URL = URL(string: "https://api.coinbase.com/v2")!) { self.baseURL = baseURL }

    public enum ProviderError: Error { case http(Int), shape, transport(String) }

    /// Decodes the payload without passing rates through Double.
    public static func parse(_ data: Data, base: String, symbols: Set<String>, now: Date) throws -> [RateQuote] {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let d = root["data"] as? [String: Any], (d["currency"] as? String) == base,
              let rates = d["rates"] as? [String: Any] else { throw ProviderError.shape }
        var out: [RateQuote] = []
        for (code, v) in rates where code != base && symbols.contains(code) && Currencies.all[code] != nil {
            guard let s = v as? String, let dec = Decimal(string: s, locale: Locale(identifier: "en_US_POSIX")), dec > 0 else { continue }
            out.append(RateQuote(quoteId: "coinbase:\(base)\(code):\(Int(now.timeIntervalSince1970))", base: base, quote: code, rate: s,
                                 source: "coinbase", observedAt: nil, receivedAt: now, rateKind: .indicative, confidence: .estimated,
                                 notes: ["Coinbase does not publish an observation time; age is measured from receivedAt"]))
        }
        return out.sorted { $0.quote < $1.quote }
    }

    public func fetchLatest(base: String, symbols: Set<String>, session: URLSession = .shared) async throws -> [RateQuote] {
        var comps = URLComponents(url: baseURL.appendingPathComponent("exchange-rates"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "currency", value: base)]
        let (data, resp) = try await session.data(from: comps.url!)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw ProviderError.http(http.statusCode) }
        return try Self.parse(data, base: base, symbols: symbols, now: Date())
    }
}

/// Sample snapshot shipped with the app (USD base). Labelled "Sample · not current" in the UI; replaced once online.
public enum SampleRates {
    public static let observedAt = ISO8601DateFormatter().date(from: "2026-10-27T00:00:00Z")!
    public static let table: [String: String] = [
        "JPY": "150.12", "THB": "33.47", "EUR": "0.9201", "GBP": "0.7742", "KRW": "1378.5", "TWD": "32.18", "CNY": "7.18", "HKD": "7.79",
        "SGD": "1.336", "MYR": "4.42", "IDR": "16080", "PHP": "57.1", "VND": "25410", "LAK": "21900", "KHR": "4080", "MMK": "2100", "INR": "84.1",
        "AUD": "1.512", "NZD": "1.66", "CAD": "1.372", "CHF": "0.879", "SEK": "10.6", "NOK": "10.9", "DKK": "6.86", "CZK": "23.2", "PLN": "3.98",
        "HUF": "372", "ISK": "138", "TRY": "34.2", "AED": "3.6725", "SAR": "3.75", "KWD": "0.3066", "BHD": "0.376", "OMR": "0.3845", "JOD": "0.709",
        "MXN": "19.6", "BRL": "5.62", "CLP": "940", "ZAR": "17.9", "EGP": "48.6", "LKR": "299", "NPR": "134.6",
    ]
    public static func quotes(now: Date = Date()) -> [RateQuote] {
        var out: [RateQuote] = []
        for (code, r) in table where Currencies.all[code] != nil {
            out.append(RateQuote(quoteId: "embedded:USD\(code)", base: "USD", quote: code, rate: r, source: "embedded",
                                 observedAt: observedAt, receivedAt: now, rateKind: .indicative, confidence: .estimated,
                                 notes: ["Sample snapshot shipped with the app (not current); replaced once online"]))
        }
        return out.sorted { $0.quote < $1.quote }
    }
}

/// USD-pivot lookup shared by the app: direct, inverted or crossed quote between any two known currencies.
public struct RateTable: Sendable {
    public let pivot = "USD"
    public let quotes: [RateQuote]
    public let source: String
    public let status: String // fresh | stale | offline | sample | loading
    public let tolerance: TimeInterval
    public init(quotes: [RateQuote], source: String, status: String, tolerance: TimeInterval = 36 * 3600) {
        self.quotes = quotes; self.source = source; self.status = status; self.tolerance = tolerance
    }
    public func quote(from base: String, to target: String) -> RateQuote? {
        if base == target { return nil }
        func find(_ c: String) -> RateQuote? { quotes.first { $0.quote == c } }
        if base == pivot { return find(target) }
        if target == pivot { return find(base)?.inverted() }
        guard let a = find(base), let b = find(target) else { return nil }
        return RateQuote.cross(a, b, tolerance: tolerance)
    }
}
