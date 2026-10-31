// Small, pre-formatted snapshot the app writes for the home/lock-screen widget (F15). Shared through the App Group
// UserDefaults suite; the widget never computes money itself and always shows "as of <time>" plus the rate's source.
import Foundation

public struct WidgetSnapshot: Codable, Sendable {
    public static let suite = "group.com.akihair.currencyintelligence"
    public static let key = "widget.snapshot.v1"

    public var selCode: String          // e.g. "THB"
    public var selBalanceText: String   // e.g. "฿9,870.00" (cash recorded by hand)
    public var homeCode: String
    public var homeEquivText: String?   // "≈ ¥44,269"
    public var pairText: String         // "1 JPY = 0.2142 THB"
    public var sourceLabel: String      // "Coinbase · observation time not published"
    public var rateReceivedAt: String   // ISO
    public var updatedAt: String        // ISO, when the app wrote the snapshot

    public init(selCode: String, selBalanceText: String, homeCode: String, homeEquivText: String?, pairText: String, sourceLabel: String, rateReceivedAt: String, updatedAt: String) {
        self.selCode = selCode; self.selBalanceText = selBalanceText; self.homeCode = homeCode; self.homeEquivText = homeEquivText
        self.pairText = pairText; self.sourceLabel = sourceLabel; self.rateReceivedAt = rateReceivedAt; self.updatedAt = updatedAt
    }

    public static func load(defaults: UserDefaults? = UserDefaults(suiteName: WidgetSnapshot.suite)) -> WidgetSnapshot? {
        guard let d = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: d)
    }
    public func save(defaults: UserDefaults? = UserDefaults(suiteName: WidgetSnapshot.suite)) {
        guard let d = try? JSONEncoder().encode(self) else { return }
        defaults?.set(d, forKey: WidgetSnapshot.key)
    }
}
