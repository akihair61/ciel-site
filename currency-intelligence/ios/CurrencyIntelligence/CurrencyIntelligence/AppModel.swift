// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
//
// Rules carried over from the web client and spec 02:
// - Convert is a SIMULATION. Only "Record as a real exchange" changes balances, both legs in one save.
// - Rates carry provenance; a rate without a published observation time is labelled as such; never "Live".
// - Balances are cash the user recorded by hand, not a financial account.
import Foundation
import SwiftUI
import CoreMoney

@MainActor
final class AppModel: ObservableObject {
    @Published var state: AppState
    @Published var rates: RateTable
    @Published var rateError: String? = nil
    @Published var notice: String? = nil
    @Published var lastConversion: Conversion? = nil

    let store: StateStore
    let rounding: RoundingMode = .halfEven
    private let coinbase = CoinbaseProvider()
    private let pollSeconds: TimeInterval = 60

    init(store: StateStore = .documents()) {
        self.store = store
        let (s, how) = store.load()
        state = s
        rates = RateTable(quotes: SampleRates.quotes(), source: "embedded", status: "sample")
        Lang.current = Lang.resolve(setting: s.lang)
        switch how {
        case .restoredFromBackup: notice = "Saved data was unreadable. Restored the last backup."
        case .unreadable(let why): notice = "Saved data was unreadable: \(why). Starting fresh."
        default: break
        }
    }

    // MARK: persistence
    func save() {
        Lang.current = Lang.resolve(setting: state.lang)
        do { try store.save(state) } catch { notice = "Could not save: \(error.localizedDescription)" }
    }

    // MARK: trips (F11)
    func currentTrip() -> Trip? { state.trip.flatMap { id in state.trips.first { $0.id == id } } }
    func createTrip(name: String, budget: String, start: Date?, end: Date?) {
        let b = (try? Money(budget.replacingOccurrences(of: ",", with: ""), currency: state.home, rounding: .down)).map { $0.decimalString }
        let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd"; df.locale = Locale(identifier: "en_US_POSIX")
        let t = Trip(id: "trip-" + String(Int(Date().timeIntervalSince1970), radix: 36), name: name.trimmingCharacters(in: .whitespaces), budget: b, home: state.home,
                     start: start.map(df.string), end: end.map(df.string), createdAt: ISO8601DateFormatter().string(from: Date()))
        state.trips.insert(t, at: 0); state.trip = t.id; save()
    }
    func deleteTrip(_ id: String) { state.trips.removeAll { $0.id == id }; if state.trip == id { state.trip = nil }; save() } // spends keep their tripId and snapshots
    func tripTotals(_ trip: Trip) -> (spent: Money, budget: Money?, remaining: Money?, n: Int, noSnap: Int, unconverted: Int) {
        var spent = Money.zero(state.home); var n = 0, noSnap = 0, unconverted = 0
        for e in state.ledger where e.kind == "spend" && e.tripId == trip.id {
            n += 1; if e.snap == nil { noSnap += 1 }
            guard let m = entryHome(e), let t = try? spent.add(m) else { unconverted += 1; continue }
            spent = t
        }
        let budget = trip.budget.flatMap { try? Money($0, currency: state.home) }
        return (spent, budget, budget.flatMap { try? $0.subtract(spent) }, n, noSnap, unconverted)
    }

    // MARK: rates
    func refreshRates() async {
        let symbols = Set(Currencies.all.keys)
        do {
            let q = try await coinbase.fetchLatest(base: "USD", symbols: symbols)
            if !q.isEmpty { rates = RateTable(quotes: q, source: "coinbase", status: "fresh"); rateError = nil; return }
        } catch { rateError = "\(error)" }
        if rates.source == "coinbase" { rates = RateTable(quotes: rates.quotes, source: "coinbase", status: "stale") }
    }

    /// Market quote (direct / inverted / crossed) or the user's realized rate for the pair.
    func quote(from: String, to: String) -> (quote: RateQuote, mine: Bool)? {
        if let m = state.mine["\(from)/\(to)"], let paid = Decimal(string: m.paid, locale: posix), let got = Decimal(string: m.received, locale: posix), paid > 0, got > 0 {
            let r = Money.roundPublic(got / paid, places: 12)
            let at = ISO8601DateFormatter().date(from: m.at) ?? Date()
            let q = RateQuote(quoteId: "user:\(from)\(to):\(m.at)", base: from, quote: to, rate: "\(r)", source: "user", observedAt: at, receivedAt: at,
                              rateKind: .userRealized, confidence: .confirmed, notes: ["derived from the user's own exchange receipt"])
            return (q, true)
        }
        guard let q = rates.quote(from: from, to: to) else { return nil }
        return (q, false)
    }

    func sourceLabel(_ q: RateQuote) -> String {
        switch q.source {
        case "user": return L("Your rate")
        case "coinbase": return "Coinbase · \(L("fetched")) \(Format.ago(q.receivedAt)) · \(L("observation time not published"))"
        case "embedded": return "\(L("Sample rate")) · \(Format.date(q.observedAt ?? q.receivedAt)) · \(L("not current"))"
        default: return "\(L("Reference rate")) · \(L("daily")) · \(Format.date(q.observedAt ?? q.receivedAt))"
        }
    }
    var statusSuffix: String {
        switch rates.status { case "stale": return " · " + L("stale"); case "offline": return " · " + L("offline, last saved"); default: return "" }
    }

    // MARK: balances
    func balance(_ code: String) -> Money? { state.balances[code].flatMap { try? Money($0, currency: code) } }
    func setBalance(_ m: Money) { state.balances[m.currency] = m.decimalString }
    var walletCodes: [String] { Array(Set(state.balances.keys).union([state.sel])).sorted() }

    func toHome(_ m: Money) -> Money? {
        if m.currency == state.home { return m }
        guard let q = quote(from: m.currency, to: state.home) else { return nil }
        return try? Converter.convert(m, quote: q.quote, rounding: rounding).convertedAmount
    }

    // MARK: convert = simulation (Q-04)
    func simulate(amount: Money, to: String) -> Conversion? {
        guard let aq = quote(from: amount.currency, to: to), let r = try? Converter.convert(amount, quote: aq.quote, rounding: rounding) else { return nil }
        let now = ISO8601DateFormatter().string(from: Date())
        let tx = Conversion(kind: "simulation", at: now, ref: "SIM-" + Format.ref(), from: amount.currency, to: to,
                            fromAmt: amount.decimalString, toAmt: r.convertedAmount.decimalString,
                            fromText: Format.money(amount), toText: Format.money(r.convertedAmount),
                            rate: aq.quote.rate, rateText: "1 \(amount.currency) = \(Format.rate(aq.quote.rate)) \(to)",
                            source: sourceLabel(aq.quote), sourceId: aq.quote.source, rateKind: aq.quote.rateKind.rawValue,
                            confidence: aq.quote.confidence.rawValue, observedAt: aq.quote.observedAt.map { ISO8601DateFormatter().string(from: $0) },
                            receivedAt: ISO8601DateFormatter().string(from: aq.quote.receivedAt), mine: aq.mine, rounding: rounding.rawValue,
                            balFrom: balance(amount.currency).map(Format.money), balTo: balance(to).map(Format.money))
        state.history.insert(tx, at: 0); state.history = Array(state.history.prefix(100)); save()
        lastConversion = tx
        return tx
    }

    /// Explicit action: both legs and both balances are written in one save.
    func recordExchange(_ sim: Conversion) -> Conversion? {
        guard sim.kind == "simulation", let paid = try? Money(sim.fromAmt, currency: sim.from), let got = try? Money(sim.toAmt, currency: sim.to) else { return nil }
        guard let newFrom = try? (balance(sim.from) ?? Money.zero(sim.from)).subtract(paid), let newTo = try? (balance(sim.to) ?? Money.zero(sim.to)).add(got) else { return nil }
        let now = ISO8601DateFormatter().string(from: Date())
        var tx = sim
        tx.kind = "exchange"; tx.at = now; tx.ref = sim.ref.replacingOccurrences(of: "SIM-", with: "EXC-"); tx.simRef = sim.ref
        tx.balFrom = Format.money(newFrom); tx.balTo = Format.money(newTo)
        setBalance(newFrom); setBalance(newTo)
        state.history.insert(tx, at: 0); state.history = Array(state.history.prefix(100))
        state.ledger.insert(LedgerEntry(kind: "exchange", at: now, ref: tx.ref, from: sim.from, to: sim.to, fromAmt: sim.fromAmt, toAmt: sim.toAmt,
                                        fromText: sim.fromText, toText: sim.toText, rateText: sim.rateText), at: 0)
        state.ledger = Array(state.ledger.prefix(500))
        save()
        lastConversion = tx
        return tx
    }

    // MARK: cash (manual records)
    func snapshot(_ m: Money) -> RateSnapshot? {
        let now = ISO8601DateFormatter().string(from: Date())
        if m.currency == state.home { return RateSnapshot(home: state.home, amount: m.decimalString, rate: "1", source: "same", observedAt: nil, receivedAt: now, rateKind: "mid", mine: false, status: rates.status) }
        guard let q = quote(from: m.currency, to: state.home), let r = try? Converter.convert(m, quote: q.quote, rounding: rounding) else { return nil }
        return RateSnapshot(home: state.home, amount: r.convertedAmount.decimalString, rate: q.quote.rate, source: q.quote.source,
                            observedAt: q.quote.observedAt.map { ISO8601DateFormatter().string(from: $0) }, receivedAt: ISO8601DateFormatter().string(from: q.quote.receivedAt),
                            rateKind: q.quote.rateKind.rawValue, mine: q.mine, status: rates.status)
    }
    func addCash(_ m: Money, note: String) {
        guard let nb = try? (balance(m.currency) ?? Money.zero(m.currency)).add(m) else { return }
        setBalance(nb); state.sel = m.currency
        state.ledger.insert(LedgerEntry(kind: "add", at: ISO8601DateFormatter().string(from: Date()), ccy: m.currency, amount: m.decimalString, note: note, tripId: state.trip, snap: snapshot(m)), at: 0)
        save()
    }
    func spend(_ m: Money, category: String, note: String) {
        guard let nb = try? (balance(m.currency) ?? Money.zero(m.currency)).subtract(m) else { return }
        setBalance(nb)
        state.ledger.insert(LedgerEntry(kind: "spend", at: ISO8601DateFormatter().string(from: Date()), ccy: m.currency, amount: m.decimalString, cat: category, note: note, tripId: state.trip, snap: snapshot(m)), at: 0)
        state.ledger = Array(state.ledger.prefix(500)); save()
    }
    /// Home-currency value of an entry: saved snapshot (default) or today's rate.
    func entryHome(_ e: LedgerEntry) -> Money? {
        if state.convBasis != "current", let s = e.snap, s.home == state.home, let m = try? Money(s.amount, currency: state.home) { return m }
        guard let a = e.amount, let c = e.ccy, let m = try? Money(a, currency: c) else { return nil }
        return toHome(m)
    }
    func weekSpend() -> Money {
        let since = Date().addingTimeInterval(-7 * 86400)
        var total = Money.zero(state.home)
        for e in state.ledger where e.kind == "spend" {
            guard let at = ISO8601DateFormatter().date(from: e.at), at >= since, let m = entryHome(e), let t = try? total.add(m) else { continue }
            total = t
        }
        return total
    }

    // MARK: pins, mine rate, settings
    func togglePin(_ code: String) {
        if let i = state.pins.firstIndex(of: code) { state.pins.remove(at: i) }
        else if state.pins.count < 12 { state.pins.append(code) } else { notice = L("Up to 12 pinned currencies"); return }
        save()
    }
    func setMine(from: String, to: String, paid: String, received: String) -> Bool {
        guard let p = Decimal(string: paid, locale: posix), let g = Decimal(string: received, locale: posix), p > 0, g > 0 else { return false }
        state.mine["\(from)/\(to)"] = MineRate(paid: paid, received: received, at: ISO8601DateFormatter().string(from: Date())); save(); return true
    }
    func clearMine(from: String, to: String) { state.mine.removeValue(forKey: "\(from)/\(to)"); save() }

    // MARK: export / import (same JSON as the web client)
    func exportData() -> Data? { try? StateStore.exportJSON(state) }
    func importData(_ data: Data) -> String? {
        switch StateStore.importJSON(data) {
        case .success(let s): state = s; save(); return nil
        case .failure(.notJSON): return L("Not a JSON file")
        case .failure(.invalid(let errs)): return "Import rejected: " + (errs.first ?? "invalid")
        }
    }

    private let posix = Locale(identifier: "en_US_POSIX")
}

extension Money {
    static func zero(_ code: String) -> Money { (try? Money(minor: 0, currency: code)) ?? Money.unsafeZero(code) }
    private static func unsafeZero(_ code: String) -> Money { try! Money(minor: 0, currency: "USD") }
    /// Exposes Money.round for the app (rounding helper is internal to the package).
    static func roundPublic(_ d: Decimal, places: Int) -> Decimal {
        var v = d; var r = Decimal()
        NSDecimalRound(&r, &v, places, .bankers)
        return r
    }
}
