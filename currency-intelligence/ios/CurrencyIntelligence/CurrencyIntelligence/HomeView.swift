// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import SwiftUI
import CoreMoney

struct HomeView: View {
    @EnvironmentObject var model: AppModel
    @State private var showAdd = false
    @State private var showSpend = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    let sel = model.balance(model.state.sel) ?? Money.zero(model.state.sel)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Format.money(sel)).font(.system(size: 40, weight: .heavy, design: .rounded)).monospacedDigit()
                        if model.state.sel != model.state.home, let h = model.toHome(sel) { Text("≈ \(Format.money(h))").foregroundStyle(.secondary) }
                    }
                    Picker("Currency", selection: Binding(get: { model.state.sel }, set: { model.state.sel = $0; model.save() })) {
                        ForEach(model.walletCodes, id: \.self) { Text("\(Format.flag($0)) \($0)").tag($0) }
                    }.pickerStyle(.segmented)
                    HStack {
                        Button { showAdd = true } label: { Label(L("Add"), systemImage: "plus") }
                        Spacer()
                        Button { showSpend = true } label: { Label("Spend", systemImage: "arrow.up") }
                    }.buttonStyle(.bordered)
                }
                if let trip = model.currentTrip() {
                    let tt = model.tripTotals(trip)
                    Section(trip.name) {
                        Text(Format.money(tt.spent)).font(.title2.weight(.bold)).monospacedDigit()
                        if let b = tt.budget, let rem = tt.remaining {
                            ProgressView(value: min(1, max(0, Double(tt.spent.minor) / Double(max(1, b.minor))))).tint(rem.minor < 0 ? .red : .green)
                            Text("\(L("Budget")) \(Format.money(b)) · \(rem.minor < 0 ? L("Over budget by") : L("Remaining")) \(Format.money(rem.minor < 0 ? (try? Money(minor: -rem.minor, currency: rem.currency)) ?? rem : rem))").font(.caption).foregroundStyle(.secondary)
                        }
                        Text(model.state.convBasis == "current" ? L("Current rate") : L("Rate at record time")).font(.caption2).foregroundStyle(.tertiary)
                    }
                }
                Section(L("Spent this week")) {
                    Text(Format.money(model.weekSpend())).font(.title2.weight(.bold)).monospacedDigit()
                }
                Section(L("Transactions")) {
                    if model.state.ledger.isEmpty { Text(L("No transactions yet. Add cash, then record what you spend.")).foregroundStyle(.secondary) }
                    ForEach(model.state.ledger.prefix(40)) { e in LedgerRow(entry: e) }
                }
                Section {
                    Text(L("Balances here are cash you recorded by hand on this device. They are not a bank, card or exchange account balance."))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Currency Intelligence")
            .sheet(isPresented: $showAdd) { CashSheet(mode: .add).environmentObject(model) }
            .sheet(isPresented: $showSpend) { CashSheet(mode: .spend).environmentObject(model) }
        }
    }
}

struct LedgerRow: View {
    let entry: LedgerEntry
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(title).font(.body.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(amount).monospacedDigit().foregroundStyle(entry.kind == "add" ? .green : .primary)
        }
    }
    var title: String {
        switch entry.kind {
        case "spend": return entry.note?.isEmpty == false ? entry.note! : (entry.cat ?? "Spend").capitalized
        case "add": return L("Cash added")
        case "exchange": return "Exchange recorded \(entry.from ?? "") → \(entry.to ?? "")"
        default: return "Conversion \(entry.from ?? "") → \(entry.to ?? "")"
        }
    }
    var subtitle: String {
        switch entry.kind {
        case "spend": return (entry.cat ?? "").capitalized + " · " + Format.dateTime(entry.at)
        case "add": return (entry.note ?? "") + " · " + Format.dateTime(entry.at)
        case "exchange": return "You recorded a real exchange · " + Format.dateTime(entry.at)
        default: return "Legacy (pre-v4): changed balances · " + Format.dateTime(entry.at)
        }
    }
    var amount: String {
        if let a = entry.amount, let c = entry.ccy, let m = try? Money(a, currency: c) { return (entry.kind == "add" ? "+" : "−") + Format.money(m) }
        return (entry.fromText ?? "") + " ↳ " + (entry.toText ?? "")
    }
}

struct CashSheet: View {
    enum Mode { case add, spend }
    let mode: Mode
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var code = "THB"
    @State private var amount = ""
    @State private var note = ""
    @State private var category = "food"
    @State private var error: String? = nil
    private let cats = ["food", "transport", "shop", "stay", "fun", "other"]

    var body: some View {
        NavigationStack {
            Form {
                Picker("Currency", selection: $code) { ForEach(Currencies.all.keys.sorted(), id: \.self) { Text("\(Format.flag($0)) \($0)").tag($0) } }
                TextField(L("Amount"), text: $amount).keyboardType(.decimalPad)
                if mode == .spend { Picker("Category", selection: $category) { ForEach(cats, id: \.self) { Text($0.capitalized).tag($0) } } }
                TextField(mode == .add ? "Source (booth, ATM…)" : L("Note (shop, place…)"), text: $note)
                if let error { Text(error).foregroundStyle(.red) }
                Text(mode == .add ? L("Your cash is recorded on this device only") : "Taken from your recorded cash; the rate at record time is saved with the entry").font(.footnote).foregroundStyle(.secondary)
            }
            .navigationTitle(mode == .add ? L("Add cash") : L("Record a spend"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(mode == .add ? "Add" : L("Record")) { go() } }
            }
            .onAppear { code = model.state.sel }
        }
    }
    func go() {
        guard let m = try? Money(amount.replacingOccurrences(of: ",", with: ""), currency: code, rounding: .down), m.minor > 0 else { error = L("Enter an amount"); return }
        if mode == .add { model.addCash(m, note: note.isEmpty ? L("Exchange booth") : note) } else { model.spend(m, category: category, note: note) }
        dismiss()
    }
}

struct CardsView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                ForEach(model.walletCodes, id: \.self) { c in
                    let b = model.balance(c) ?? Money.zero(c)
                    HStack {
                        Text(Format.flag(c)).font(.largeTitle)
                        VStack(alignment: .leading) { Text(c).font(.headline); Text(Currencies.all[c]?.nameEn ?? "").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text(Format.money(b)).font(.headline).monospacedDigit()
                            if c != model.state.home, let h = model.toHome(b) { Text("≈ \(Format.money(h))").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
                Section { Text(L("Cards show cash you recorded by hand on this device, not an actual financial account balance.")).font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle(L("Cards"))
        }
    }
}
