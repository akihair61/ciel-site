// Home-screen and lock-screen widget (F15). Shows the cash balance recorded in the app and the last rate the app saw,
// always with "as of" time and source — a widget cannot fetch rates on its own schedule reliably, so it never claims live data.
import WidgetKit
import SwiftUI
import CoreMoney

struct Entry: TimelineEntry {
    let date: Date
    let snap: WidgetSnapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snap: sample) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), snap: WidgetSnapshot.load() ?? sample)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let entry = Entry(date: Date(), snap: WidgetSnapshot.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
    var sample: WidgetSnapshot {
        WidgetSnapshot(selCode: "THB", selBalanceText: "฿9,870.00", homeCode: "JPY", homeEquivText: "≈ ¥44,269", pairText: "1 JPY = 0.2142 THB", sourceLabel: "Sample", rateReceivedAt: ISO8601DateFormatter().string(from: Date()), updatedAt: ISO8601DateFormatter().string(from: Date()))
    }
}

func asOf(_ iso: String) -> String {
    let f = ISO8601DateFormatter(); let f2 = ISO8601DateFormatter(); f2.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let d = f2.date(from: iso) ?? f.date(from: iso) else { return "" }
    let df = DateFormatter(); df.dateStyle = .none; df.timeStyle = .short
    return df.string(from: d)
}

struct CurrencyWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var body: some View {
        if let s = entry.snap {
            switch family {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(s.selBalanceText).font(.headline).monospacedDigit()
                    Text(s.pairText).font(.caption2)
                    Text("as of \(asOf(s.rateReceivedAt))").font(.caption2).foregroundStyle(.secondary)
                }
            case .accessoryInline:
                Text("\(s.selBalanceText) · \(s.pairText)")
            default:
                VStack(alignment: .leading, spacing: 4) {
                    HStack { Text(s.selCode).font(.caption.weight(.bold)).foregroundStyle(.secondary); Spacer(); Text("cash").font(.caption2).foregroundStyle(.secondary) }
                    Text(s.selBalanceText).font(.system(.title2, design: .rounded).weight(.heavy)).monospacedDigit().minimumScaleFactor(0.6)
                    if let h = s.homeEquivText { Text(h).font(.caption).foregroundStyle(.secondary) }
                    Spacer(minLength: 2)
                    Text(s.pairText).font(.caption.weight(.semibold)).monospacedDigit()
                    Text("\(s.sourceLabel) · as of \(asOf(s.rateReceivedAt))").font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                }
            }
        } else {
            VStack(spacing: 4) { Text("Currency Intelligence").font(.caption.weight(.bold)); Text("Open the app once to fill the widget.").font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center) }
        }
    }
}

@main
struct CurrencyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CurrencyWidget", provider: Provider()) { entry in
            CurrencyWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Cash & rate")
        .description("Your recorded cash balance and the last rate the app saw, with its source and time. Not live.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}
