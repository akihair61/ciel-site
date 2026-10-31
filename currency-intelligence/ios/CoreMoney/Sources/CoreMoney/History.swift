// Daily reference-rate history for charts (F02). Frankfurter v2 blended reference rates (covers every app currency, not only
// the ECB set), one point per published day — never real time, and the UI says so. Values are for drawing only (Double is fine here);
// money math never touches them.
import Foundation

public struct RatePoint: Hashable, Sendable, Identifiable {
    public var id: String { date }
    public let date: String   // YYYY-MM-DD
    public let rate: Double
}

public struct FrankfurterHistory: Sendable {
    public let baseURL: URL
    public init(baseURL: URL = URL(string: "https://api.frankfurter.dev/v2")!) { self.baseURL = baseURL }

    /// Payload is an array of {date, base, quote, rate}.
    public static func parse(_ data: Data, to: String) throws -> [RatePoint] {
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw FrankfurterProvider.ProviderError.shape }
        var out: [RatePoint] = []
        for row in rows where (row["quote"] as? String) == to { if let date = row["date"] as? String, let r = row["rate"] as? NSNumber { out.append(RatePoint(date: date, rate: r.doubleValue)) } }
        return out.sorted { $0.date < $1.date }
    }

    public func fetch(from: String, to: String, days: Int, now: Date = Date(), session: URLSession = .shared) async throws -> [RatePoint] {
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"; df.locale = Locale(identifier: "en_US_POSIX"); df.timeZone = TimeZone(identifier: "UTC")
        let start = df.string(from: now.addingTimeInterval(-Double(days) * 86400)), end = df.string(from: now)
        var comps = URLComponents(url: baseURL.appendingPathComponent("rates"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "from", value: start), URLQueryItem(name: "to", value: end),
                            URLQueryItem(name: "base", value: from), URLQueryItem(name: "quotes", value: to)]
        let (data, resp) = try await session.data(from: comps.url!)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw FrankfurterProvider.ProviderError.http(http.statusCode) }
        return try Self.parse(data, to: to)
    }
}
