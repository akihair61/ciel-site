// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import SwiftUI
import Charts
import CoreMoney

struct RateInfoView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var paid = ""
    @State private var got = ""
    @State private var period = "1M"
    @State private var points: [RatePoint] = []
    @State private var loadingChart = false
    private let periodDays = ["1W": 7, "1M": 30, "3M": 91, "1Y": 365]
    var pair: (quote: RateQuote, mine: Bool)? { model.quote(from: model.state.from, to: model.state.to) }

    var body: some View {
        NavigationStack {
            List {
                if let p = pair {
                    Section {
                        Text("1 \(model.state.from) = \(Format.rate(p.quote.rate)) \(model.state.to)").font(.title3.weight(.heavy)).monospacedDigit()
                        Text(model.sourceLabel(p.quote) + model.statusSuffix).font(.footnote).foregroundStyle(.secondary)
                    }
                    Section {
                        Picker("", selection: $period) { ForEach(["1W", "1M", "3M", "1Y"], id: \.self) { Text($0).tag($0) } }.pickerStyle(.segmented)
                        if points.count >= 2 {
                            Chart(points) { p in LineMark(x: .value("Date", p.date), y: .value("Rate", p.rate)).interpolationMethod(.monotone) }
                                .chartXAxis(.hidden).chartYScale(domain: .automatic(includesZero: false)).frame(height: 120)
                            let first = points.first!.rate, last = points.last!.rate, ch = (last - first) / first * 100
                            Text("\(points.first!.date) → \(points.last!.date) · \(points.count) \(L("daily")) · \(ch >= 0 ? "▲" : "▼") \(String(format: "%.2f", abs(ch)))%").font(.caption).foregroundStyle(.secondary)
                        } else if loadingChart { ProgressView() } else { Text(L("History loads when online (daily)")).font(.caption).foregroundStyle(.secondary) }
                        Text(L("Change = last point vs first point of the period. Daily points are ECB reference rates (one per working day, no weekend or holiday points). 1D = ticks collected while the app is open.")).font(.footnote).foregroundStyle(.secondary)
                    }
                    Section(L("Provenance")) {
                        row(L("Source"), sourceText(p.quote))
                        row("Type", "\(p.quote.rateKind.rawValue) · \(p.quote.confidence.rawValue)")
                        row(L("Freshness"), freshness)
                        row(L("Observed"), p.quote.observedAt.map { Format.dateTime(ISO8601DateFormatter().string(from: $0)) } ?? "Not published by provider; age is counted from the fetch")
                        row(L("Fetched"), Format.dateTime(ISO8601DateFormatter().string(from: p.quote.receivedAt)))
                        row(L("Expires"), p.quote.expiresAt.map { Format.dateTime(ISO8601DateFormatter().string(from: $0)) } ?? L("Not stated by provider"))
                        row("Math", (p.quote.derivedFrom != nil ? "Cross rate via USD · " : "") + "rounding \(model.rounding.rawValue)")
                        if let n = p.quote.notes?.first(where: { $0.contains("observation time unknown") }) { row("Note", n) }
                    }
                } else { Text(L("No rate for this pair")) }
                Section(L("Your rate")) {
                    Text(L("Enter the two numbers from your exchange receipt. Conversions then use your true rate.")).font(.footnote).foregroundStyle(.secondary)
                    TextField("You paid (\(model.state.from))", text: $paid).keyboardType(.decimalPad)
                    TextField("You got (\(model.state.to))", text: $got).keyboardType(.decimalPad)
                    HStack {
                        Button(L("Use this rate")) { if !model.setMine(from: model.state.from, to: model.state.to, paid: paid, received: got) { model.notice = L("Enter both amounts") } }
                        Spacer()
                        Button(L("Back to market rate")) { model.clearMine(from: model.state.from, to: model.state.to) }
                    }.buttonStyle(.bordered)
                }
                Section(L("Home currency")) {
                    Picker(L("Home currency"), selection: Binding(get: { model.state.home }, set: { model.state.home = $0; model.save() })) {
                        ForEach(Currencies.all.keys.sorted(), id: \.self) { Text("\(Format.flag($0)) \($0)").tag($0) }
                    }
                }
            }
            .navigationTitle(L("About this rate"))
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } } }
            .onAppear { if let m = model.state.mine["\(model.state.from)/\(model.state.to)"] { paid = m.paid; got = m.received } }
            .task(id: period) { await loadChart() }
            .refreshable { await model.refreshRates() }
        }
    }
    func loadChart() async {
        loadingChart = true; defer { loadingChart = false }
        points = (try? await model.history.fetch(from: model.state.from, to: model.state.to, days: periodDays[period] ?? 30)) ?? []
    }
    var freshness: String {
        switch model.rates.status { case "fresh": return "Fresh"; case "stale": return "Stale · older than its refresh window"; case "sample": return "Sample · shipped with the app, not current"; default: return model.rates.status }
    }
    func sourceText(_ q: RateQuote) -> String {
        switch q.source {
        case "user": return "Your exchange receipt"
        case "embedded": return "Sample snapshot shipped with the app (not current)"
        case "coinbase": return "Coinbase exchange rates (indicative; refreshed about once a minute while open; no observation time published)"
        default: return q.source
        }
    }
    func row(_ k: String, _ v: String) -> some View { HStack(alignment: .top) { Text(k).foregroundStyle(.secondary); Spacer(); Text(v).multilineTextAlignment(.trailing) }.font(.subheadline) }
}
