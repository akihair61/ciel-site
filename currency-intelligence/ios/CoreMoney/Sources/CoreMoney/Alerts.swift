// Rate alerts (F06). Mirrors packages/core/src/alerts.ts: pure evaluation with expiry and per-alert cooldown.
// Checked only while the app is open (after each rate refresh); no background work, no server.
import Foundation

public struct RateAlert: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var from: String
    public var to: String
    public var threshold: String        // decimal string
    public var direction: String        // "above" | "below"
    public var createdAt: String
    public var expiresAt: String?
    public var cooldownMs: Int
    public var active: Bool
    public var lastFiredAt: String?
    public var fireCount: Int
    public var note: String?
    public init(id: String, from: String, to: String, threshold: String, direction: String, createdAt: String, expiresAt: String?, cooldownMs: Int, active: Bool = true, lastFiredAt: String? = nil, fireCount: Int = 0, note: String? = nil) {
        self.id = id; self.from = from; self.to = to; self.threshold = threshold; self.direction = direction; self.createdAt = createdAt
        self.expiresAt = expiresAt; self.cooldownMs = cooldownMs; self.active = active; self.lastFiredAt = lastFiredAt; self.fireCount = fireCount; self.note = note
    }
}

public struct AlertFire: Codable, Hashable, Sendable, Identifiable {
    public var id: String; public var alertId: String; public var at: String; public var from: String; public var to: String
    public var rate: String; public var threshold: String; public var direction: String; public var source: String
    public var observedAt: String?; public var receivedAt: String
}

public enum Alerts {
    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    public static func parse(_ s: String?) -> Date? { guard let s else { return nil }; return iso.date(from: s) ?? ISO8601DateFormatter().date(from: s) }

    public static func status(_ a: RateAlert, now: Date) -> String {
        if !a.active { return "paused" }
        if let e = parse(a.expiresAt), e <= now { return "expired" }
        return "active"
    }
    public static func conditionMet(_ a: RateAlert, rate: String) -> Bool {
        guard let r = Decimal(string: rate, locale: Locale(identifier: "en_US_POSIX")), let t = Decimal(string: a.threshold, locale: Locale(identifier: "en_US_POSIX")) else { return false }
        return a.direction == "above" ? r >= t : r <= t
    }
    /// Returns the updated alerts and the fires. `quote` gives the current quote for a pair or nil.
    public static func evaluate(_ alerts: [RateAlert], now: Date, quote: (String, String) -> RateQuote?) -> (alerts: [RateAlert], fires: [AlertFire], expired: [String]) {
        var fires: [AlertFire] = []; var expired: [String] = []
        let nowS = iso.string(from: now)
        let out: [RateAlert] = alerts.map { a in
            var a = a
            guard a.active else { return a }
            if let e = parse(a.expiresAt), e <= now { expired.append(a.id); a.active = false; return a }
            guard let q = quote(a.from, a.to), conditionMet(a, rate: q.rate) else { return a }
            if let last = parse(a.lastFiredAt), now.timeIntervalSince(last) * 1000 < Double(a.cooldownMs) { return a }
            fires.append(AlertFire(id: UUID().uuidString, alertId: a.id, at: nowS, from: a.from, to: a.to, rate: q.rate, threshold: a.threshold, direction: a.direction, source: q.source,
                                   observedAt: q.observedAt.map { iso.string(from: $0) }, receivedAt: iso.string(from: q.receivedAt)))
            a.lastFiredAt = nowS; a.fireCount += 1
            return a
        }
        return (out, fires, expired)
    }
}
