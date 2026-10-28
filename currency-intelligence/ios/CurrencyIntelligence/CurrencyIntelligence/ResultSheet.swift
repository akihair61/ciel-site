// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import SwiftUI
import CoreMoney

/// "Converted" sheet. The conversion is a SIMULATION until the user taps "Record as a real exchange".
struct ResultSheet: View {
    let tx: Conversion
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmRecord = false
    @State private var receipt: Conversion? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                Text("Converted").font(.title2.weight(.heavy))
                Text(tx.rateText + (tx.mine == true ? " (your rate)" : "")).foregroundStyle(.secondary).font(.footnote)
                Label("Simulation · no balance changed, no money moved", systemImage: "circle.fill").font(.caption.weight(.bold)).foregroundStyle(.orange)
                    .padding(.vertical, 6).padding(.horizontal, 12).background(Capsule().fill(.orange.opacity(0.15)))
                HStack(spacing: 12) {
                    tile("From \(tx.from)", "−" + tx.fromText, .primary)
                    Image(systemName: "chevron.right").foregroundStyle(.secondary)
                    tile("To \(tx.to)", "+" + tx.toText, .green)
                }
                VStack(alignment: .leading, spacing: 6) {
                    row("\(Format.flag(tx.from)) \(tx.from) balance (unchanged)", tx.balFrom ?? "Not set")
                    row("\(Format.flag(tx.to)) \(tx.to) balance (unchanged)", tx.balTo ?? "Not set")
                }
                Button { receipt = tx } label: { listRow("doc.text", "Simulation note (receipt)") }
                Button { confirmRecord = true } label: { listRow("checkmark", "Record as a real exchange") }
                Button("Done") { dismiss() }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                Spacer()
            }
            .padding()
            .confirmationDialog("Record this as a real exchange you made?\n−\(tx.fromText) \(tx.from)\n+\(tx.toText) \(tx.to)\nThis changes the balances recorded on this device.", isPresented: $confirmRecord, titleVisibility: .visible) {
                Button("Record exchange") { if let r = model.recordExchange(tx) { receipt = r } }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(item: $receipt) { r in ReceiptView(tx: r).environmentObject(model) }
        }
    }
    func tile(_ small: String, _ big: String, _ color: Color) -> some View {
        VStack(alignment: .leading) { Text(small).font(.caption).foregroundStyle(.secondary); Text(big).font(.title3.weight(.heavy)).monospacedDigit().foregroundStyle(color) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(12).background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }
    func row(_ k: String, _ v: String) -> some View { HStack { Text(k).foregroundStyle(.secondary); Spacer(); Text(v).monospacedDigit().bold() }.font(.subheadline) }
    func listRow(_ icon: String, _ title: String) -> some View {
        HStack { Image(systemName: icon); Text(title).bold(); Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
            .padding().background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground))).foregroundStyle(.primary)
    }
}

/// Receipt, labelled by kind: "simulation note", "exchange record" or legacy conversion.
struct ReceiptView: View {
    let tx: Conversion
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    var kind: String { tx.kind ?? "legacy_convert" }
    var sim: Bool { kind == "simulation" }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    Text(kind == "exchange" ? "EXCHANGE RECORD" : sim ? "SIMULATION NOTE" : "LEGACY CONVERSION").font(.caption.weight(.heavy)).tracking(2).foregroundStyle(.secondary)
                    Text(kind == "exchange" ? "RECORDED" : sim ? "SIMULATED" : "LEGACY").font(.caption.weight(.heavy)).tracking(2)
                        .padding(6).overlay(RoundedRectangle(cornerRadius: 6).stroke(lineWidth: 2)).foregroundStyle(kind == "exchange" ? .green : .orange).rotationEffect(.degrees(-8))
                    Text(sim ? "You would get" : "You converted").font(.footnote).foregroundStyle(.secondary)
                    Text(tx.toText).font(.system(size: 40, weight: .heavy, design: .rounded)).monospacedDigit()
                    Text("for \(tx.fromText)").foregroundStyle(.secondary)
                    Text(Format.dateTime(tx.at)).font(.caption).foregroundStyle(.secondary)
                    Divider()
                    rows([(sim ? "You'd pay" : "You paid", tx.fromText), (sim ? "You'd get" : "You got", tx.toText), ("Exchange rate", tx.rateText),
                          ("Fee", tx.mine == true ? "Included in your rate" : "Not included (reference rate)"), ("Reference", tx.ref)])
                    Divider()
                    Text(sim ? "BALANCES (UNCHANGED)" : "NEW BALANCES").font(.caption.weight(.heavy)).frame(maxWidth: .infinity, alignment: .leading)
                    rows([(tx.from, tx.balFrom ?? "No balance recorded"), (tx.to, tx.balTo ?? "No balance recorded")])
                    Text("RATE SOURCE").font(.caption.weight(.heavy)).frame(maxWidth: .infinity, alignment: .leading)
                    rows([("Source", tx.source), ("Type", "\(tx.rateKind ?? "") · \(tx.confidence ?? "")"), ("Observed", Format.dateTime(tx.observedAt)), ("Fetched", Format.dateTime(tx.receivedAt)), ("Rounding", tx.rounding ?? "")])
                    Text(kind == "exchange" ? "A record you entered of a real exchange. Balances on this device were updated." : sim ? "A simulation at the rate shown. No balance changed and no money moved." : "Made before v4, when Convert changed balances. Kept as it was.")
                        .font(.footnote).padding(10).background(RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemBackground)))
                    Text("A note kept on your device (record or simulation), not a statement from an exchange, bank or card issuer.").font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding()
            }
            .navigationTitle("Receipt")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) { ShareLink(item: shareText) }
            }
        }
    }
    var shareText: String { "\(kind == "exchange" ? "Exchange record" : sim ? "Simulation (no money moved)" : "Legacy conversion")\n\(tx.fromText) → \(tx.toText)\n\(tx.rateText)\n\(tx.source)\n\(tx.ref)" }
    func rows(_ items: [(String, String)]) -> some View {
        VStack(spacing: 6) { ForEach(items, id: \.0) { item in HStack(alignment: .top) { Text(item.0).foregroundStyle(.secondary); Spacer(); Text(item.1).bold().monospacedDigit().multilineTextAlignment(.trailing) }.font(.subheadline) } }
    }
}
