// 未ビルド: macOS で `swift test` を実行して確認してください(ios/README_MAC.md)。
//
// Persistent state. Field names and value shapes match the web client's localStorage schema v4 (apps/web/app.js)
// so a JSON file exported from the PWA imports here and vice versa. Amounts are decimal *strings*, never Double.
import Foundation

public struct MineRate: Codable, Hashable, Sendable {
    public var paid: String; public var received: String; public var at: String
    public init(paid: String, received: String, at: String) { self.paid = paid; self.received = received; self.at = at }
}

public struct RateSnapshot: Codable, Hashable, Sendable {
    public var home: String; public var amount: String; public var rate: String; public var source: String
    public var observedAt: String?; public var receivedAt: String?; public var rateKind: String?; public var mine: Bool?; public var status: String?
    public init(home: String, amount: String, rate: String, source: String, observedAt: String? = nil, receivedAt: String? = nil, rateKind: String? = nil, mine: Bool? = nil, status: String? = nil) {
        self.home = home; self.amount = amount; self.rate = rate; self.source = source; self.observedAt = observedAt; self.receivedAt = receivedAt; self.rateKind = rateKind; self.mine = mine; self.status = status
    }
}

public struct LedgerEntry: Codable, Hashable, Sendable, Identifiable {
    public var id: String { "\(kind)-\(at)-\(ref ?? ccy ?? "")" }
    public var kind: String            // spend | add | exchange | convert (legacy)
    public var at: String
    public var ccy: String?; public var amount: String?; public var cat: String?; public var note: String?
    public var ref: String?; public var from: String?; public var to: String?; public var fromAmt: String?; public var toAmt: String?
    public var fromText: String?; public var toText: String?; public var rateText: String?
    public var legacy: Bool?; public var tripId: String?; public var snap: RateSnapshot?
    public init(kind: String, at: String, ccy: String? = nil, amount: String? = nil, cat: String? = nil, note: String? = nil, ref: String? = nil, from: String? = nil, to: String? = nil,
                fromAmt: String? = nil, toAmt: String? = nil, fromText: String? = nil, toText: String? = nil, rateText: String? = nil, legacy: Bool? = nil, tripId: String? = nil, snap: RateSnapshot? = nil) {
        self.kind = kind; self.at = at; self.ccy = ccy; self.amount = amount; self.cat = cat; self.note = note; self.ref = ref; self.from = from; self.to = to
        self.fromAmt = fromAmt; self.toAmt = toAmt; self.fromText = fromText; self.toText = toText; self.rateText = rateText; self.legacy = legacy; self.tripId = tripId; self.snap = snap
    }
}

public struct Conversion: Codable, Hashable, Sendable, Identifiable {
    public var id: String { ref }
    public var kind: String?           // simulation | exchange | legacy_convert
    public var at: String; public var ref: String; public var from: String; public var to: String
    public var fromAmt: String; public var toAmt: String; public var fromText: String; public var toText: String
    public var rate: String; public var rateText: String; public var source: String; public var sourceId: String?
    public var rateKind: String?; public var confidence: String?; public var observedAt: String?; public var receivedAt: String?
    public var mine: Bool?; public var rounding: String?; public var balFrom: String?; public var balTo: String?; public var simRef: String?
    public init(kind: String?, at: String, ref: String, from: String, to: String, fromAmt: String, toAmt: String, fromText: String, toText: String, rate: String, rateText: String, source: String,
                sourceId: String? = nil, rateKind: String? = nil, confidence: String? = nil, observedAt: String? = nil, receivedAt: String? = nil, mine: Bool? = nil, rounding: String? = nil,
                balFrom: String? = nil, balTo: String? = nil, simRef: String? = nil) {
        self.kind = kind; self.at = at; self.ref = ref; self.from = from; self.to = to; self.fromAmt = fromAmt; self.toAmt = toAmt; self.fromText = fromText; self.toText = toText
        self.rate = rate; self.rateText = rateText; self.source = source; self.sourceId = sourceId; self.rateKind = rateKind; self.confidence = confidence; self.observedAt = observedAt
        self.receivedAt = receivedAt; self.mine = mine; self.rounding = rounding; self.balFrom = balFrom; self.balTo = balTo; self.simRef = simRef
    }
}

public struct Trip: Codable, Hashable, Sendable, Identifiable {
    public var id: String; public var name: String; public var budget: String?; public var home: String?
    public var start: String?; public var end: String?; public var createdAt: String?
    public init(id: String, name: String, budget: String? = nil, home: String? = nil, start: String? = nil, end: String? = nil, createdAt: String? = nil) {
        self.id = id; self.name = name; self.budget = budget; self.home = home; self.start = start; self.end = end; self.createdAt = createdAt
    }
}

public struct Migration: Codable, Hashable, Sendable {
    public var from: Int; public var to: Int; public var at: String; public var note: String?
    public init(from: Int, to: Int, at: String, note: String? = nil) { self.from = from; self.to = to; self.at = at; self.note = note }
}

public struct AppState: Codable, Sendable {
    public static let schema = 4
    public var schemaVersion: Int = AppState.schema
    public var onboarded: Bool = false
    public var home = "JPY", sel = "THB", from = "JPY", to = "THB"
    public var balances: [String: String] = [:]
    public var mine: [String: MineRate] = [:]
    public var history: [Conversion] = []
    public var ledger: [LedgerEntry] = []
    public var pins: [String] = []
    public var trips: [Trip] = []
    public var trip: String? = nil
    public var motion = "auto"
    public var lang = "auto"
    public var convBasis = "snapshot"
    public var migrations: [Migration] = []
    public init() {}

    enum CodingKeys: String, CodingKey { case schemaVersion, onboarded, home, sel, from, to, balances, mine, history, ledger, pins, trips, trip, motion, lang, convBasis, migrations }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 3
        onboarded = try c.decodeIfPresent(Bool.self, forKey: .onboarded) ?? false
        home = try c.decodeIfPresent(String.self, forKey: .home) ?? "JPY"
        sel = try c.decodeIfPresent(String.self, forKey: .sel) ?? "THB"
        from = try c.decodeIfPresent(String.self, forKey: .from) ?? "JPY"
        to = try c.decodeIfPresent(String.self, forKey: .to) ?? "THB"
        balances = try c.decodeIfPresent([String: String].self, forKey: .balances) ?? [:]
        mine = try c.decodeIfPresent([String: MineRate].self, forKey: .mine) ?? [:]
        history = try c.decodeIfPresent([Conversion].self, forKey: .history) ?? []
        ledger = try c.decodeIfPresent([LedgerEntry].self, forKey: .ledger) ?? []
        pins = try c.decodeIfPresent([String].self, forKey: .pins) ?? []
        trips = try c.decodeIfPresent([Trip].self, forKey: .trips) ?? []
        trip = try c.decodeIfPresent(String.self, forKey: .trip)
        motion = try c.decodeIfPresent(String.self, forKey: .motion) ?? "auto"
        lang = try c.decodeIfPresent(String.self, forKey: .lang) ?? "auto"
        convBasis = try c.decodeIfPresent(String.self, forKey: .convBasis) ?? "snapshot"
        migrations = try c.decodeIfPresent([Migration].self, forKey: .migrations) ?? []
    }

    /// Same v3 → v4 rule as the web client: pre-v4 conversions changed balances; keep them, mark them legacy.
    public mutating func migrateIfNeeded(now: Date = Date()) {
        guard schemaVersion < AppState.schema else { return }
        history = history.map { var h = $0; if h.kind == nil { h.kind = "legacy_convert" }; return h }
        ledger = ledger.map { var e = $0; if e.kind == "convert" && e.legacy != true { e.legacy = true }; return e }
        migrations.append(Migration(from: schemaVersion, to: AppState.schema, at: ISO8601DateFormatter().string(from: now), note: "existing conversions marked legacy (they changed balances); new Convert is a simulation"))
        schemaVersion = AppState.schema
    }

    /// Validation used before replacing data with an imported file. Mirrors validateState() in app.js.
    public func validate() -> [String] {
        var errors: [String] = []
        if schemaVersion > AppState.schema { errors.append("schema v\(schemaVersion) is newer than this app (v\(AppState.schema))") }
        for (c, v) in balances {
            if Currencies.all[c] == nil { errors.append("unknown currency \(c)") }
            else if Decimal(string: v, locale: Locale(identifier: "en_US_POSIX")) == nil || v.contains(",") { errors.append("balance \(c) is not a decimal string") }
        }
        for e in ledger where e.kind == "spend" || e.kind == "add" {
            guard let a = e.amount, let c = e.ccy, Currencies.all[c] != nil, Decimal(string: a, locale: Locale(identifier: "en_US_POSIX")) != nil else { errors.append("a ledger entry has a bad amount or currency"); break }
        }
        for c in [home, sel, from, to] where Currencies.all[c] == nil { errors.append("\(c) is not a known currency") }
        if !["auto", "on", "off"].contains(motion) { errors.append("motion must be auto/on/off") }
        if !["auto", "en", "ja", "th"].contains(lang) { errors.append("lang must be auto/en/ja/th") }
        if pins.contains(where: { Currencies.all[$0] == nil }) { errors.append("pins must be known currency codes") }
        return errors
    }
}

/// Export envelope shared with the web client.
public struct ExportEnvelope: Codable, Sendable {
    public var app = "currency-intelligence"
    public var schemaVersion = AppState.schema
    public var exportedAt: String
    public var data: AppState
    public init(data: AppState, now: Date = Date()) { self.data = data; exportedAt = ISO8601DateFormatter().string(from: now) }
}

/// JSON file store with a backup copy and atomic writes (spec 02 Q-06).
public struct StateStore {
    public let url: URL
    public let backupURL: URL
    public init(directory: URL) {
        url = directory.appendingPathComponent("state.v4.json")
        backupURL = directory.appendingPathComponent("state.v4.bak.json")
    }
    public static func documents() -> StateStore {
        StateStore(directory: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0])
    }
    static func decoder() -> JSONDecoder { JSONDecoder() }
    static func encoder() -> JSONEncoder { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }

    public enum LoadResult { case fresh, loaded, restoredFromBackup, unreadable(String) }

    public func load() -> (AppState, LoadResult) {
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path) {
            if let d = try? Data(contentsOf: url), var s = try? Self.decoder().decode(AppState.self, from: d) { s.migrateIfNeeded(); return (s, .loaded) }
            if let d = try? Data(contentsOf: backupURL), var s = try? Self.decoder().decode(AppState.self, from: d) { s.migrateIfNeeded(); return (s, .restoredFromBackup) }
            return (AppState(), .unreadable("state file unreadable and no usable backup; old file left in place"))
        }
        return (AppState(), .fresh)
    }

    /// One atomic write per save; the previous file becomes the backup first.
    public func save(_ s: AppState) throws {
        let data = try Self.encoder().encode(s)
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path) {
            if fm.fileExists(atPath: backupURL.path) { try fm.removeItem(at: backupURL) }
            try fm.copyItem(at: url, to: backupURL)
        }
        try data.write(to: url, options: .atomic)
    }

    public static func exportJSON(_ s: AppState) throws -> Data {
        let e = JSONEncoder(); e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try e.encode(ExportEnvelope(data: s))
    }

    /// Accepts either the envelope or a bare state object. Returns the migrated state or the validation errors.
    public static func importJSON(_ data: Data) -> Result<AppState, ImportError> {
        let dec = JSONDecoder()
        var state: AppState
        // Envelope {app, schemaVersion, exportedAt?, data} or a bare state object. Decide by the "app" key so a
        // partial envelope is never mistaken for a (nearly empty) bare state.
        guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return .failure(.notJSON) }
        if (root["app"] as? String) == "currency-intelligence" {
            guard let inner = root["data"] as? [String: Any], let innerData = try? JSONSerialization.data(withJSONObject: inner),
                  let s = try? dec.decode(AppState.self, from: innerData) else { return .failure(.notJSON) }
            if let v = root["schemaVersion"] as? Int, v > AppState.schema { return .failure(.invalid(["schema v\(v) is newer than this app (v\(AppState.schema))"])) }
            state = s
        } else if let s = try? dec.decode(AppState.self, from: data) { state = s }
        else { return .failure(.notJSON) }
        let errors = state.validate()
        if !errors.isEmpty { return .failure(.invalid(errors)) }
        state.migrateIfNeeded()
        return .success(state)
    }
    public enum ImportError: Error { case notJSON, invalid([String]) }
}
