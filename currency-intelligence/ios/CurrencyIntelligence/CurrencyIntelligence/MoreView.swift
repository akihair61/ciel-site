// 未ビルド: CI(GitHub Actions macOS)で確認。More tab: trips & budget, split a bill, all rates, conversion notes, settings.
import SwiftUI
import CoreMoney

struct MoreView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                NavigationLink { TripsView() } label: { Label(L("Trips & budget"), systemImage: "airplane") }
                NavigationLink { SplitView() } label: { Label(L("Split a bill"), systemImage: "person.2") }
                NavigationLink { AllRatesView() } label: { Label(L("All rates"), systemImage: "list.bullet") }
                NavigationLink { HistoryView() } label: { Label(L("Conversion notes"), systemImage: "doc.text") }
                NavigationLink { SettingsView() } label: { Label(L("Rate, motion & data"), systemImage: "gearshape") }
            }
            .navigationTitle(L("More"))
        }
    }
}

// MARK: - Trips & budget (F11)
struct TripsView: View {
    @EnvironmentObject var model: AppModel
    @State private var name = ""
    @State private var budget = ""
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(7 * 86400)
    @State private var useDates = false

    var body: some View {
        List {
            Section {
                if model.state.trips.isEmpty { Text(L("No trips yet.")).foregroundStyle(.secondary) }
                ForEach(model.state.trips) { trip in
                    let tt = model.tripTotals(trip)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack { Text(trip.name).font(.headline); if trip.id == model.state.trip { Text("· " + L("Current")).foregroundStyle(.blue) }; Spacer() }
                        if let b = tt.budget { Text("\(L("Budget")) \(Format.money(b)) · \(L("Spent")) \(Format.money(tt.spent))").font(.caption).foregroundStyle(.secondary) }
                        else { Text("\(L("Spent")) \(Format.money(tt.spent))").font(.caption).foregroundStyle(.secondary) }
                        HStack {
                            if trip.id == model.state.trip { Button(L("End trip")) { model.state.trip = nil; model.save() } } else { Button(L("Use")) { model.state.trip = trip.id; model.save() } }
                            Button(L("Delete"), role: .destructive) { model.deleteTrip(trip.id) }
                        }.buttonStyle(.bordered).font(.caption)
                    }
                }
            }
            Section(L("New trip")) {
                Text(L("Budget is in your home currency. Each spend keeps the rate at the time you record it.")).font(.footnote).foregroundStyle(.secondary)
                TextField(L("Trip name"), text: $name)
                TextField("\(L("Budget")) (\(model.state.home))", text: $budget).keyboardType(.decimalPad)
                Toggle(L("Date"), isOn: $useDates)
                if useDates { DatePicker(L("Start"), selection: $start, displayedComponents: .date); DatePicker(L("End"), selection: $end, displayedComponents: .date) }
                Button(L("Create trip")) {
                    guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { model.notice = L("Enter a trip name and a budget"); return }
                    model.createTrip(name: name, budget: budget, start: useDates ? start : nil, end: useDates ? end : nil); name = ""; budget = ""
                }
            }
            Section(L("Conversion basis")) {
                Text(L("Totals use the rate saved when each spend was recorded, or today's rate.")).font(.footnote).foregroundStyle(.secondary)
                Picker("", selection: Binding(get: { model.state.convBasis }, set: { model.state.convBasis = $0; model.save() })) {
                    Text(L("Rate at record time")).tag("snapshot"); Text(L("Current rate")).tag("current")
                }.pickerStyle(.segmented)
            }
        }
        .navigationTitle(L("Trips & budget"))
    }
}

// MARK: - Split a bill (F13)
struct SplitView: View {
    @EnvironmentObject var model: AppModel
    @State private var total = ""
    @State private var people = ["Me", "A", "B"]
    @State private var newName = ""
    @State private var byWeight = false
    @State private var weights: [String: Int] = [:]
    @State private var payer = "Me"
    var currency: String { model.state.sel }

    var result: (res: SplitResult, transfers: [Transfer])? {
        guard let t = try? Money(total.replacingOccurrences(of: ",", with: ""), currency: currency, rounding: .down), t.minor > 0, !people.isEmpty else { return nil }
        let w = people.map { max(0, weights[$0] ?? 1) }
        guard !byWeight || w.contains(where: { $0 > 0 }) else { return nil }
        guard let r = try? (byWeight ? Split.byWeight(t, participants: people, weights: w) : Split.equal(t, participants: people)),
              let tr = try? Split.settle(r.shares, payments: [Payment(payerId: payer, amount: t)]) else { return nil }
        return (r, tr)
    }

    var body: some View {
        List {
            Section {
                HStack { Text("\(Format.flag(currency)) \(currency)").font(.headline); TextField("0", text: $total).keyboardType(.decimalPad).multilineTextAlignment(.trailing).font(.title2.weight(.heavy)) }
            }
            Section(L("People")) {
                ForEach(people, id: \.self) { p in
                    HStack {
                        Text(p)
                        Spacer()
                        if byWeight { Stepper("\(weights[p] ?? 1)", value: Binding(get: { weights[p] ?? 1 }, set: { weights[p] = $0 }), in: 0...99).frame(maxWidth: 150) }
                        Button(role: .destructive) { if people.count > 1 { people.removeAll { $0 == p }; if payer == p { payer = people[0] } } else { model.notice = L("Keep at least one person") } } label: { Image(systemName: "xmark.circle") }.buttonStyle(.plain)
                    }
                }
                HStack { TextField(L("Add a name"), text: $newName); Button(L("Add")) { let n = newName.trimmingCharacters(in: .whitespaces); guard !n.isEmpty else { return }; if people.contains(n) { model.notice = L("Already in the list"); return }; if people.count >= 20 { model.notice = L("Up to 20 people"); return }; people.append(n); newName = "" } }
            }
            Section(L("Split")) {
                Picker("", selection: $byWeight) { Text(L("Equally")).tag(false); Text(L("By weight")).tag(true) }.pickerStyle(.segmented)
            }
            Section(L("Who paid")) { Picker("", selection: $payer) { ForEach(people, id: \.self) { Text($0).tag($0) } }.pickerStyle(.menu) }
            if let r = result {
                Section("\(L("Shares")) · \(Format.money(r.res.total))") {
                    ForEach(r.res.shares, id: \.participantId) { s in HStack { Text(s.participantId); if r.res.roundingAbsorbedBy.contains(s.participantId) { Text(L("+rounding")).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(Format.money(s.amount)).monospacedDigit().bold() } }
                }
                Section(L("Proposal to reduce transfers")) {
                    if r.transfers.isEmpty { Text(L("Nothing to settle: the payer's share equals the total.")).foregroundStyle(.secondary) }
                    ForEach(r.transfers) { t in HStack { Text("\(t.from) → \(t.to)"); Spacer(); Text(Format.money(t.amount)).monospacedDigit().bold() } }
                    ShareLink(item: summary(r)) { Label(L("Share summary"), systemImage: "square.and.arrow.up") }
                }
            } else { Section { Text(L("Enter a total to see each share.")).foregroundStyle(.secondary) } }
            Section { Text(L("Shares always add up to the total. Rounding leftovers go to the first people in the list, one minor unit each.")).font(.footnote).foregroundStyle(.secondary) }
        }
        .navigationTitle(L("Split a bill"))
    }
    func summary(_ r: (res: SplitResult, transfers: [Transfer])) -> String {
        var lines = ["Split \(Format.money(r.res.total)) (\(byWeight ? "by weight" : "equally")), paid by \(payer)"]
        lines += r.res.shares.map { "  \($0.participantId): \(Format.money($0.amount))" }
        lines.append("Proposal to reduce transfers (not guaranteed minimal):")
        lines += r.transfers.isEmpty ? ["  nothing to settle"] : r.transfers.map { "  \($0.from) → \($0.to) \(Format.money($0.amount))" }
        return lines.joined(separator: "\n")
    }
}

// MARK: - All rates (F03)
struct AllRatesView: View {
    @EnvironmentObject var model: AppModel
    var base: Money { (try? Money("1", currency: model.state.from)) ?? Money.zero(model.state.from) }
    var codes: [String] { (model.state.pins.isEmpty ? Array(Set(model.walletCodes + [model.state.to, model.state.home])).sorted() : model.state.pins).filter { $0 != base.currency }.prefix(12).map { $0 } }
    var body: some View {
        List {
            Section { Text(Format.money(base)).font(.title.weight(.heavy)).monospacedDigit(); Text("\(model.state.from) → \(codes.joined(separator: " · "))").font(.caption).foregroundStyle(.secondary) }
            Section {
                ForEach(codes, id: \.self) { c in
                    HStack {
                        Text(Format.flag(c)).font(.title2)
                        VStack(alignment: .leading) { Text(c).font(.headline); Text(Currencies.all[c].map { Lang.current == "ja" ? $0.nameJa : $0.nameEn } ?? "").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        VStack(alignment: .trailing) {
                            if let q = model.quote(from: base.currency, to: c), let r = try? Converter.convert(base, quote: q.quote, rounding: model.rounding) {
                                Text(Format.money(r.convertedAmount)).monospacedDigit().bold()
                                Text(model.sourceLabel(q.quote) + model.statusSuffix).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            } else { Text(L("No rate available")).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
            Section { Text(L("Pinned currencies (up to 12). Pin more from the currency picker.")).font(.footnote).foregroundStyle(.secondary) }
        }
        .navigationTitle(L("All rates"))
    }
}

// MARK: - Conversion notes (history)
struct HistoryView: View {
    @EnvironmentObject var model: AppModel
    @State private var open: Conversion? = nil
    var body: some View {
        List {
            if model.state.history.isEmpty { Text(L("Nothing yet. Tap Convert and it shows up here.")).foregroundStyle(.secondary) }
            ForEach(model.state.history) { h in
                Button { open = h } label: {
                    HStack {
                        Text("\(Format.flag(h.from))\(Format.flag(h.to))")
                        VStack(alignment: .leading) { Text("\(h.from) → \(h.to)  ").font(.headline) + Text(h.kind == "exchange" ? L("recorded") : h.kind == "simulation" ? L("simulation") : L("legacy")).font(.caption).foregroundColor(.secondary); Text(Format.dateTime(h.at)).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        VStack(alignment: .trailing) { Text(h.toText).bold().monospacedDigit(); Text("\(L("for")) \(h.fromText)").font(.caption).foregroundStyle(.secondary) }
                    }
                }.buttonStyle(.plain)
            }
        }
        .navigationTitle(L("Conversions"))
        .sheet(item: $open) { ReceiptView(tx: $0).environmentObject(model) }
    }
}
