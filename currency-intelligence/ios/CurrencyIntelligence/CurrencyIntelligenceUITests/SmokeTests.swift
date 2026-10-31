// Screen-tapping smoke test run on the CI macOS runner (iPhone simulator). Screenshots are written to /tmp/ci-shots
// (the simulator shares the host file system) and committed to docs/screenshots/ios by the workflow.
import XCTest

final class SmokeTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func shot(_ app: XCUIApplication, _ name: String) {
        let s = app.screenshot()
        let a = XCTAttachment(screenshot: s); a.name = name; a.lifetime = .keepAlways; add(a)
        let dir = "/tmp/ci-shots"
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: "\(dir)/\(name).png", contents: s.pngRepresentation)
    }

    func testConvertIsSimulationThenRecordChangesBalances() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Currency Intelligence"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["฿9,870.00"].exists, "seeded THB balance shown")
        shot(app, "ui-01-home")

        app.tabBars.buttons["Convert"].tap()
        let cta = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Convert ¥'")).firstMatch
        XCTAssertTrue(cta.waitForExistence(timeout: 5), "CTA shows the prefilled amount")
        shot(app, "ui-02-convert")
        cta.tap()

        XCTAssertTrue(app.staticTexts["Converted"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Simulation'")).firstMatch.exists, "result sheet is labelled a simulation")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'unchanged'")).firstMatch.exists, "balances shown as unchanged")
        shot(app, "ui-03-converted-simulation")

        app.buttons["Record as a real exchange"].tap()
        let confirm = app.buttons["Record exchange"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertTrue(app.staticTexts["RECORDED"].waitForExistence(timeout: 8), "receipt is an exchange record")
        XCTAssertTrue(app.staticTexts["EXCHANGE RECORD"].exists)
        XCTAssertTrue(app.staticTexts["¥47,000"].exists, "JPY balance went down by 1000")
        shot(app, "ui-04-receipt-recorded")
        // Close the receipt, then the result sheet underneath it, until the tab bar is reachable.
        for _ in 0..<3 where !app.tabBars.buttons["More"].isHittable {
            let done = app.buttons["Done"].firstMatch
            if done.waitForExistence(timeout: 3) { done.tap() }
        }
        XCTAssertTrue(app.tabBars.buttons["More"].waitForExistence(timeout: 5))
        app.tabBars.buttons["More"].tap()
        XCTAssertTrue(app.staticTexts["Split a bill"].waitForExistence(timeout: 5))
        shot(app, "ui-05-more")
        app.staticTexts["Split a bill"].tap()
        XCTAssertTrue(app.navigationBars["Split a bill"].waitForExistence(timeout: 5))
        shot(app, "ui-06-split")
    }
}
