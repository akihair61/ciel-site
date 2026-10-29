// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import Foundation
import CoreMoney

enum Format {
    /// Currency formatting from the exact decimal string (never via Double).
    static func money(_ m: Money) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = m.currency
        f.locale = Locale(identifier: "en_US")
        if let sym = Currencies.all[m.currency]?.symbol { f.currencySymbol = sym } // same symbols as the web client (฿, ¥, ₩ …)
        f.minimumFractionDigits = m.scale
        f.maximumFractionDigits = m.scale
        return f.string(from: NSDecimalNumber(string: m.decimalString, locale: Locale(identifier: "en_US_POSIX"))) ?? "\(m.currency) \(m.decimalString)"
    }
    static func rate(_ r: String) -> String {
        guard let d = Decimal(string: r, locale: Locale(identifier: "en_US_POSIX")) else { return r }
        let places = d >= 100 ? 2 : d >= 1 ? 4 : 5
        var v = d; var out = Decimal(); NSDecimalRound(&out, &v, places, .bankers)
        return "\(out)"
    }
    static func date(_ d: Date) -> String {
        let f = DateFormatter(); f.locale = Lang.locale; f.dateStyle = .medium; f.timeStyle = .none; return f.string(from: d)
    }
    static func dateTime(_ iso: String?) -> String {
        guard let iso, let d = ISO8601DateFormatter().date(from: iso) ?? ISO8601DateFormatter.withFraction.date(from: iso) else { return L("Not published by provider") }
        let f = DateFormatter(); f.locale = Lang.locale; f.dateStyle = .medium; f.timeStyle = .short; return f.string(from: d)
    }
    static func ago(_ d: Date) -> String {
        let s = Int(max(0, Date().timeIntervalSince(d)))
        return s < 60 ? L("{n}s ago").replacingOccurrences(of: "{n}", with: "\(s)") : s < 3600 ? L("{n}m ago").replacingOccurrences(of: "{n}", with: "\(s / 60)") : L("{n}h ago").replacingOccurrences(of: "{n}", with: "\(s / 3600)")
    }
    static func ref() -> String {
        let chars = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        func part() -> String { String((0..<5).map { _ in chars.randomElement()! }) }
        return part() + "-" + part()
    }
    static func flag(_ code: String) -> String {
        let cc: [String: String] = ["JPY": "JP", "THB": "TH", "USD": "US", "EUR": "EU", "GBP": "GB", "KRW": "KR", "TWD": "TW", "CNY": "CN", "HKD": "HK", "SGD": "SG", "MYR": "MY", "IDR": "ID", "PHP": "PH", "VND": "VN", "LAK": "LA", "KHR": "KH", "MMK": "MM", "INR": "IN", "AUD": "AU", "NZD": "NZ", "CAD": "CA", "CHF": "CH", "SEK": "SE", "NOK": "NO", "DKK": "DK", "CZK": "CZ", "PLN": "PL", "HUF": "HU", "ISK": "IS", "TRY": "TR", "AED": "AE", "SAR": "SA", "KWD": "KW", "BHD": "BH", "OMR": "OM", "JOD": "JO", "MXN": "MX", "BRL": "BR", "CLP": "CL", "ZAR": "ZA", "EGP": "EG", "LKR": "LK", "NPR": "NP"]
        guard let c = cc[code] else { return "¤" }
        return String(c.unicodeScalars.compactMap { UnicodeScalar(0x1F1E6 + $0.value - 65).map(Character.init) })
    }
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
}
