// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import SwiftUI
import CoreMoney

struct ConvertView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var input = ""
    @State private var showResult = false
    @State private var showRate = false
    @State private var pick: PickTarget? = nil
    @State private var loading = false
    enum PickTarget: Identifiable { case from, to; var id: Int { self == .from ? 0 : 1 } }

    var amount: Money? { try? Money(input.replacingOccurrences(of: ",", with: ""), currency: model.state.from, rounding: .down) }
    var converted: Money? {
        guard let a = amount, a.minor > 0, let q = model.quote(from: model.state.from, to: model.state.to) else { return nil }
        return try? Converter.convert(a, quote: q.quote, rounding: model.rounding).convertedAmount
    }
    /// Honour Reduce Motion unless the user set motion "on"; "off" always skips (spec 02 Q-03).
    var reduced: Bool { model.state.motion == "off" || (model.state.motion != "on" && reduceMotion) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                box(title: L("You convert"), code: model.state.from, balance: model.balance(model.state.from)) {
                    TextField("0", text: $input).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                        .font(.system(size: 34, weight: .heavy, design: .rounded)).monospacedDigit()
                } tap: { pick = .from }
                Button { swap() } label: { Image(systemName: "arrow.up.arrow.down").padding(10).background(Circle().fill(.primary)).foregroundStyle(Color(.systemBackground)) }
                box(title: L("You get"), code: model.state.to, balance: model.balance(model.state.to)) {
                    Text(converted.map(Format.money) ?? Format.money(Money.zero(model.state.to)))
                        .font(.system(size: 34, weight: .heavy, design: .rounded)).monospacedDigit()
                        .foregroundStyle(converted == nil ? .tertiary : .primary).frame(maxWidth: .infinity, alignment: .trailing)
                        .contentTransition(reduced ? .identity : .numericText())
                } tap: { pick = .to }
                Button { showRate = true } label: { rateRow }.buttonStyle(.plain)
                Spacer()
                Button {
                    guard let a = amount, a.minor > 0 else { return }
                    loading = true
                    Task {
                        if !reduced { try? await Task.sleep(nanoseconds: 1_050_000_000) } // reference: CTA morphs for ~1s before the sheet
                        _ = model.simulate(amount: a, to: model.state.to)
                        loading = false; showResult = true
                    }
                } label: {
                    HStack { if loading { ProgressView().tint(.white) } else { Image(systemName: "arrow.left.arrow.right") }; Text(ctaText) }
                        .frame(maxWidth: .infinity).padding().background(Capsule().fill(.primary)).foregroundStyle(Color(.systemBackground)).font(.headline)
                }
                .disabled(converted == nil || loading)
            }
            .padding()
            .navigationTitle(L("Convert"))
            .sheet(isPresented: $showResult) { if let tx = model.lastConversion { ResultSheet(tx: tx).environmentObject(model) } }
            .sheet(isPresented: $showRate) { RateInfoView().environmentObject(model) }
            .sheet(item: $pick) { which in
                CurrencyPicker(title: which == .from ? L("Convert from") : L("Convert to")) { code in
                    if which == .from { if code == model.state.to { model.state.to = model.state.from }; model.state.from = code; input = "" }
                    else { if code == model.state.from { model.state.from = model.state.to }; model.state.to = code }
                    model.save()
                }.environmentObject(model)
            }
        }
    }

    var ctaText: String {
        guard let a = amount, a.minor > 0 else { return L("Enter an amount") }
        return converted == nil ? L("No rate available") : "Convert \(Format.money(a))"
    }
    var rateRow: some View {
        HStack(spacing: 10) {
            Circle().fill(model.rates.status == "fresh" ? .green : .orange).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                if let q = model.quote(from: model.state.from, to: model.state.to) {
                    Text("1 \(model.state.from) = \(Format.rate(q.quote.rate)) \(model.state.to)").font(.subheadline.weight(.bold)).monospacedDigit()
                    Text(model.sourceLabel(q.quote) + model.statusSuffix).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                } else { Text(L("No rate for this pair")).font(.subheadline) }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.secondary)
        }
        .padding(12).background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
    }
    func box<Content: View>(title: String, code: String, balance: Money?, @ViewBuilder content: () -> Content, tap: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text(title).font(.caption).foregroundStyle(.secondary); Spacer(); Text(balance.map { "Balance \(Format.money($0))" } ?? L("No balance")).font(.caption).foregroundStyle(.secondary) }
            HStack {
                Button(action: tap) { HStack(spacing: 6) { Text(Format.flag(code)); Text(code).font(.headline); Image(systemName: "chevron.down").font(.caption) }
                    .padding(.vertical, 6).padding(.horizontal, 10).background(Capsule().fill(Color(.systemBackground))) }.buttonStyle(.plain)
                content()
            }
        }
        .padding(14).background(RoundedRectangle(cornerRadius: 22).fill(Color(.secondarySystemBackground)))
    }
    func swap() {
        let f = model.state.from; model.state.from = model.state.to; model.state.to = f
        if let s = Currencies.all[model.state.from]?.scale, s == 0 { input = input.components(separatedBy: ".").first ?? "" }
        model.save()
    }
}

struct CurrencyPicker: View {
    let title: String
    let onPick: (String) -> Void
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    var codes: [String] {
        let all = Currencies.all.values.filter { search.isEmpty || $0.code.lowercased().contains(search.lowercased()) || $0.nameEn.lowercased().contains(search.lowercased()) || $0.nameJa.contains(search) }.map(\.code).sorted()
        return model.state.pins.filter { all.contains($0) } + all.filter { !model.state.pins.contains($0) }
    }
    var body: some View {
        NavigationStack {
            List {
                if !model.state.pins.isEmpty && search.isEmpty {
                    Section(L("Pinned")) { rows(model.state.pins) }
                    Section(L("All currencies")) { rows(codes.filter { !model.state.pins.contains($0) }) }
                } else {
                    rows(codes)
                }
            }
            .searchable(text: $search, prompt: L("Search currency"))
            .navigationTitle(title)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }
    func rows(_ list: [String]) -> some View {
        ForEach(list, id: \.self) { c in
            HStack {
                Button { onPick(c); dismiss() } label: {
                    HStack { Text(Format.flag(c)); VStack(alignment: .leading) { Text(c).font(.headline); Text(Currencies.all[c]?.nameEn ?? "").font(.caption).foregroundStyle(.secondary) }; Spacer()
                        if let b = model.balance(c) { Text(Format.money(b)).font(.caption).foregroundStyle(.secondary) } }
                }.buttonStyle(.plain)
                Button { model.togglePin(c) } label: { Image(systemName: model.state.pins.contains(c) ? "star.fill" : "star").foregroundStyle(model.state.pins.contains(c) ? .orange : .secondary) }.buttonStyle(.plain)
            }
        }
    }
}
