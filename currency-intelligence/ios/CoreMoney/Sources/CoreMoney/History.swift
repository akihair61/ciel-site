// Daily reference-rate history for charts (F02). Frankfurter = ECB reference rates, one point per working day,
// published once a day — never real time, and the UI says so. Values are for drawing only (Double is fine here);
// money math never touches them.
import Foundation

public struct RatePoint: Hashable, Sendable, Identifiable {
    public var id: String { date }
    public let date: String   // YYYY-MM-DD
    public let rate: Double
}

public struct FrankfurterHistory: Sendable {
    public let baseURL: URL
    public init(baseURL: URL = URL(string: "https://api.frankfurter.app")!) { self.baseURL = baseURL }

    public static func parse(_ data: Data, to: String) throws -> [RatePoint] {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any], let rates = root["rates"] as? [String: Any] else { throw CoinbaseProvider.ProviderError.shape }
        var out: [RatePoint] = []
        for (date, v) in rates { if let d = v as? [String: Any], let r = d[to] as? NSNumber { out.append(RatePoint(date: date, rate: r.doubleValue)) } }
        return out.sorted { $0.date < $1.date }
    }

    public func fetch(from: String, to: String, days: Int, now: Date = Date(), session: URLSession = .shared) async throws -> [RatePoint] {
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"; df.locale = Locale(identifier: "en_US_POSIX"); df.timeZone = TimeZone(identifier: "UTC")
        let start = df.string(from: now.addingTimeInterval(-Double(days) * 86400)), end = df.string(from: now)
        var comps = URLComponents(url: baseURL.appendingPathComponent("\(start)..\(end)"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "from", value: from), URLQueryItem(name: "to", value: to)]
        let (data, resp) = try await session.data(from: comps.url!)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw CoinbaseProvider.ProviderError.http(http.statusCode) }
        return try Self.parse(data, to: to)
    }
}
