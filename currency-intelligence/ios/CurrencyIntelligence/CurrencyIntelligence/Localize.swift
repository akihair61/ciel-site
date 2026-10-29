// UI language (F01): same keys and translations as the web client (Strings.swift is generated from apps/web/i18n.js).
import Foundation

enum Lang {
    static var current = "en"
    static func resolve(setting: String) -> String {
        if ["en", "ja", "th"].contains(setting) { return setting }
        let pref = (Locale.preferredLanguages.first ?? "en").prefix(2)
        return pref == "ja" ? "ja" : pref == "th" ? "th" : "en"
    }
    static var locale: Locale { Locale(identifier: current == "ja" ? "ja_JP" : current == "th" ? "th_TH@calendar=gregorian" : "en_US") }
}

/// Translate a UI string; unknown keys fall back to English.
func L(_ key: String) -> String {
    guard let e = Strings.table[key] else { return key }
    switch Lang.current { case "ja": return e.ja; case "th": return e.th; default: return key }
}
