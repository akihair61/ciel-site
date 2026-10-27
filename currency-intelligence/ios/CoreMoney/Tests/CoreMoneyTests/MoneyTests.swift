// 未実行: Linux 環境に Swift ツールチェーンがないため、このテストは実行していません。
// 期待値は packages/core/test/*.test.ts と同一にしてあります(両実装の整合テスト)。
import XCTest
@testable import CoreMoney

final class MoneyTests: XCTestCase {
    func testScaleFromISO4217() throws {
        XCTAssertEqual(try Currencies.meta("JPY").scale, 0)
        XCTAssertEqual(try Currencies.meta("THB").scale, 2)
        XCTAssertEqual(try Currencies.meta("KWD").scale, 3)
        XCTAssertThrowsError(try Currencies.meta("XXX"))
    }

    func testParseRespectsScaleAndRefusesImplicitRounding() throws {
        XCTAssertEqual(try Money("1500", currency: "JPY").minor, 1500)
        XCTAssertEqual(try Money("12.34", currency: "THB").minor, 1234)
        XCTAssertEqual(try Money("1.234", currency: "KWD").minor, 1234)
        XCTAssertThrowsError(try Money("1.5", currency: "JPY"))
        XCTAssertEqual(try Money("1.234", currency: "THB", rounding: .halfUp).decimalString, "1.23")
        XCTAssertEqual(try Money("1.235", currency: "THB", rounding: .halfEven).decimalString, "1.24")
    }

    func testMultiplyRounding() throws {
        let p = try Money("1000", currency: "JPY")
        XCTAssertEqual(try p.multiply(Decimal(string: "0.225")!, rounding: .halfEven).decimalString, "225")
        XCTAssertEqual(try p.multiply(Decimal(string: "0.2255")!, rounding: .halfEven).decimalString, "226")
        XCTAssertEqual(try p.multiply(Decimal(string: "0.2245")!, rounding: .halfEven).decimalString, "224")
    }

    func testAllocateInvariant() throws {
        let parts = try Money("100", currency: "JPY").allocate([1, 1, 1])
        XCTAssertEqual(parts.map(\.minor), [34, 33, 33])
        let w = try Money("10.00", currency: "THB").allocate([2, 1, 1])
        XCTAssertEqual(w.map(\.decimalString), ["5.00", "2.50", "2.50"])
        let neg = try Money("-100", currency: "JPY").allocate([1, 1, 1])
        XCTAssertEqual(neg.map(\.minor), [-34, -33, -33])
    }

    func testConvert() throws {
        let q = RateQuote(quoteId: "t", base: "THB", quote: "JPY", rate: "4.4642", source: "test",
                          observedAt: Date(), receivedAt: Date(), rateKind: .mid, confidence: .confirmed)
        let r = try Converter.convert(try Money("350", currency: "THB"), quote: q, rounding: .halfEven)
        XCTAssertEqual(r.convertedAmount.decimalString, "1562")
        XCTAssertFalse(r.estimated)
        XCTAssertThrowsError(try Converter.convert(try Money("1", currency: "JPY"), quote: q, rounding: .halfUp))
    }
}
