// 未実行: この作業環境に Swift がないため未実行。macOS で `swift test`。期待値は packages/core/test と同じ。
import XCTest
@testable import CoreMoney

final class SpecTwoTests: XCTestCase {
    func testCoinbasePayloadKeepsEveryDigitAndHasNoObservationTime() throws {
        let json = #"{"data":{"currency":"USD","rates":{"JPY":"150.000000000000000001","THB":"33.41","BTC":"0.0000142","XYZ":"1"}}}"#.data(using: .utf8)!
        let q = try CoinbaseProvider.parse(json, base: "USD", symbols: ["JPY", "THB", "BTC"], now: Date())
        XCTAssertEqual(q.count, 2) // BTC is not a known fiat currency; XYZ not requested
        let jpy = try XCTUnwrap(q.first { $0.quote == "JPY" })
        XCTAssertEqual(jpy.rate, "150.000000000000000001")
        XCTAssertNil(jpy.observedAt)
        XCTAssertEqual(jpy.staleness(now: jpy.receivedAt.addingTimeInterval(30), ttl: 45).basis, .receivedAt)
        XCTAssertEqual(jpy.staleness(now: jpy.receivedAt.addingTimeInterval(30), ttl: 45).status, .fresh)
    }

    func testCrossWithUnknownObservationTimeIsEstimated() throws {
        let now = Date()
        let a = RateQuote(quoteId: "a", base: "USD", quote: "JPY", rate: "150", source: "coinbase", observedAt: nil, receivedAt: now, rateKind: .indicative, confidence: .estimated)
        let b = RateQuote(quoteId: "b", base: "USD", quote: "THB", rate: "33.5", source: "coinbase", observedAt: nil, receivedAt: now, rateKind: .indicative, confidence: .estimated)
        let x = try XCTUnwrap(RateQuote.cross(a, b, tolerance: 60))
        XCTAssertEqual(x.base, "JPY"); XCTAssertEqual(x.quote, "THB")
        XCTAssertNil(x.observedAt); XCTAssertEqual(x.confidence, .estimated)
        XCTAssertEqual(x.rate.prefix(9), "0.2233333")
        let conv = try Converter.convert(try Money("1000", currency: "JPY"), quote: x, rounding: .halfEven)
        XCTAssertEqual(conv.convertedAmount.decimalString, "223.33")
    }

    func testStateRoundTripMatchesWebSchemaAndMigratesV3() throws {
        let v3 = #"{"onboarded":true,"home":"JPY","balances":{"JPY":"48000","THB":"9870.00"},"history":[{"at":"2026-10-27T01:00:00Z","ref":"EXC-A","from":"JPY","to":"THB","fromAmt":"1000","toAmt":"223.30","fromText":"¥1,000","toText":"฿223.30","rate":"0.2233","rateText":"1 JPY = 0.2233 THB","source":"x"}],"ledger":[{"kind":"convert","at":"2026-10-27T01:00:00Z","ref":"EXC-A","from":"JPY","to":"THB"},{"kind":"add","at":"2026-10-26T01:00:00Z","ccy":"THB","amount":"9870.00","note":"booth"}]}"#.data(using: .utf8)!
        let r = StateStore.importJSON(v3)
        guard case .success(let s) = r else { return XCTFail("import failed: \(r)") }
        XCTAssertEqual(s.schemaVersion, 4)
        XCTAssertEqual(s.history.first?.kind, "legacy_convert")
        XCTAssertEqual(s.ledger.first?.legacy, true)
        XCTAssertEqual(s.balances["JPY"], "48000")
        let out = try StateStore.exportJSON(s)
        let back = StateStore.importJSON(out)
        guard case .success(let s2) = back else { return XCTFail("re-import failed") }
        XCTAssertEqual(s2.balances, s.balances)
        XCTAssertEqual(s2.migrations.count, 1)
    }

    func testImportRejectsBadBalancesAndNewerSchema() {
        let bad = #"{"app":"currency-intelligence","schemaVersion":4,"data":{"balances":{"JPY":"12,5"}}}"#.data(using: .utf8)!
        if case .failure(.invalid(let e)) = StateStore.importJSON(bad) { XCTAssertTrue(e.first?.contains("decimal") ?? false) } else { XCTFail("should reject") }
        let newer = #"{"schemaVersion":9,"balances":{}}"#.data(using: .utf8)!
        if case .failure(.invalid(let e)) = StateStore.importJSON(newer) { XCTAssertTrue(e.first?.contains("newer") ?? false) } else { XCTFail("should reject newer schema") }
    }

    func testStoreSaveKeepsBackupAndWritesAtomically() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ci-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = StateStore(directory: dir)
        var s = AppState(); s.balances["JPY"] = "1"
        try store.save(s)
        s.balances["JPY"] = "2"
        try store.save(s)
        let (loaded, how) = store.load()
        XCTAssertEqual(loaded.balances["JPY"], "2")
        if case .loaded = how {} else { XCTFail("expected loaded") }
        let bak = try JSONDecoder().decode(AppState.self, from: Data(contentsOf: store.backupURL))
        XCTAssertEqual(bak.balances["JPY"], "1")
    }

    func testSampleRateTableCrossesViaUSD() throws {
        let t = RateTable(quotes: SampleRates.quotes(), source: "embedded", status: "sample")
        let q = try XCTUnwrap(t.quote(from: "JPY", to: "THB"))
        XCTAssertEqual(q.base, "JPY"); XCTAssertEqual(q.quote, "THB")
        XCTAssertEqual(q.confidence, .estimated)
        XCTAssertEqual(try Converter.convert(try Money("1000", currency: "JPY"), quote: q, rounding: .halfEven).convertedAmount.decimalString, "222.95")
    }
}

final class SplitTests: XCTestCase {
    func testSharesSumToTotalAndRoundingGoesToFirst() throws {
        let r = try Split.equal(try Money("1000.01", currency: "THB"), participants: ["Me", "A", "B", "Dee"])
        XCTAssertEqual(r.shares.map { $0.amount.decimalString }, ["250.01", "250.00", "250.00", "250.00"])
        XCTAssertEqual(r.roundingAbsorbedBy, ["Me"])
        let w = try Split.byWeight(try Money("1000.01", currency: "THB"), participants: ["Me", "A", "B", "Dee"], weights: [2, 1, 1, 1])
        XCTAssertEqual(w.shares.map { $0.amount.decimalString }, ["400.01", "200.00", "200.00", "200.00"])
    }
    func testSettleReducesTransfersAndNetsToZero() throws {
        let r = try Split.equal(try Money("1000.01", currency: "THB"), participants: ["Me", "A", "B", "Dee"])
        let t = try Split.settle(r.shares, payments: [Payment(payerId: "A", amount: r.total)])
        XCTAssertEqual(t.map { "\($0.from)>\($0.to):\($0.amount.decimalString)" }, ["Me>A:250.01", "B>A:250.00", "Dee>A:250.00"])
        XCTAssertLessThanOrEqual(t.count, 3) // debtors(3) + creditors(1) - 1
        let net = t.reduce(0) { $0 + $1.amount.minor }
        XCTAssertEqual(net, r.total.minor - r.shares[1].amount.minor)
    }
}


final class HistoryTests: XCTestCase {
    func testFrankfurterHistoryParsesAndSortsByDate() throws {
        let json = #"{"amount":1,"base":"JPY","start_date":"2026-10-01","end_date":"2026-10-03","rates":{"2026-10-03":{"THB":0.2138},"2026-10-01":{"THB":0.2141},"2026-10-02":{"THB":0.2140}}}"#.data(using: .utf8)!
        let pts = try FrankfurterHistory.parse(json, to: "THB")
        XCTAssertEqual(pts.map { $0.date }, ["2026-10-01", "2026-10-02", "2026-10-03"])
        XCTAssertEqual(pts.last?.rate, 0.2138)
    }
}

final class AlertTests: XCTestCase {
    func q(_ rate: String, now: Date) -> RateQuote { RateQuote(quoteId: "x", base: "JPY", quote: "THB", rate: rate, source: "coinbase", observedAt: nil, receivedAt: now, rateKind: .indicative, confidence: .estimated) }
    func testFiresInclusiveAndHonoursCooldownAndExpiry() {
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        let a = RateAlert(id: "a1", from: "JPY", to: "THB", threshold: "0.2200", direction: "above", createdAt: "2026-10-31T00:00:00Z", expiresAt: nil, cooldownMs: 3_600_000)
        XCTAssertTrue(Alerts.conditionMet(a, rate: "0.2200")); XCTAssertFalse(Alerts.conditionMet(a, rate: "0.2199"))
        let r1 = Alerts.evaluate([a], now: t0) { _, _ in self.q("0.2234", now: t0) }
        XCTAssertEqual(r1.fires.count, 1); XCTAssertNil(r1.fires[0].observedAt); XCTAssertEqual(r1.alerts[0].fireCount, 1)
        let r2 = Alerts.evaluate(r1.alerts, now: t0.addingTimeInterval(600)) { _, _ in self.q("0.23", now: t0) }
        XCTAssertEqual(r2.fires.count, 0, "cooldown")
        let r3 = Alerts.evaluate(r1.alerts, now: t0.addingTimeInterval(3_660)) { _, _ in self.q("0.23", now: t0) }
        XCTAssertEqual(r3.fires.count, 1); XCTAssertEqual(r3.alerts[0].fireCount, 2)
        var e = a; e.expiresAt = ISO8601DateFormatter().string(from: t0.addingTimeInterval(-1))
        let r4 = Alerts.evaluate([e], now: t0) { _, _ in self.q("0.23", now: t0) }
        XCTAssertEqual(r4.fires.count, 0); XCTAssertEqual(r4.expired, ["a1"]); XCTAssertFalse(r4.alerts[0].active)
        XCTAssertEqual(Alerts.status(r4.alerts[0], now: t0), "expired")
    }
}
