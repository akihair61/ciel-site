// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import SwiftUI
import UniformTypeIdentifiers
import CoreMoney

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @State private var importing = false
    @State private var exportURL: URL? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section(L("Motion")) {
                    Picker(L("Motion"), selection: Binding(get: { model.state.motion }, set: { model.state.motion = $0; model.save() })) {
                        Text(L("Auto")).tag("auto"); Text(L("On")).tag("on"); Text(L("Off")).tag("off")
                    }.pickerStyle(.segmented)
                    Text(L("\"Auto\" follows your device's Reduce Motion setting. \"Off\" shows every result in one short step.")).font(.footnote).foregroundStyle(.secondary)
                }
                Section(L("Language")) {
                    Picker("", selection: Binding(get: { model.state.lang }, set: { model.state.lang = $0; model.save() })) {
                        Text(L("Auto")).tag("auto"); Text("English").tag("en"); Text("日本語").tag("ja"); Text("ไทย").tag("th")
                    }.pickerStyle(.segmented)
                    Text(L("Follows your device unless you pick one.")).font(.footnote).foregroundStyle(.secondary)
                }
                Section(L("Your data")) {
                    Text(L("Everything stays on this device (one backup copy is kept). Export a JSON file to move it to another device or browser; import replaces what is here after you confirm.")).font(.footnote).foregroundStyle(.secondary)
                    Button(L("Export JSON")) { export() }
                    if let url = exportURL { ShareLink(item: url) { Label("Share the exported file", systemImage: "square.and.arrow.up") } }
                    Button(L("Import JSON")) { importing = true }
                    Text("Schema v\(model.state.schemaVersion) · \(model.state.balances.count) balances · \(model.state.ledger.count) transactions · \(model.state.history.count) conversions").font(.caption).foregroundStyle(.secondary)
                }
                Section("Rates") {
                    Text("Coinbase (fetched about once a minute while open; no observation time published) → sample snapshot shipped with the app. Never called \"Live\".").font(.footnote).foregroundStyle(.secondary)
                    Button("Refresh now") { Task { await model.refreshRates() } }
                    if let e = model.rateError { Text(e).font(.caption).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Settings")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                guard case .success(let url) = result else { return }
                let ok = url.startAccessingSecurityScopedResource(); defer { if ok { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else { model.notice = "Could not read the file"; return }
                if let err = model.importData(data) { model.notice = err } else { model.notice = "Imported" }
            }
        }
    }
    func export() {
        guard let data = model.exportData() else { model.notice = "Export failed"; return }
        let name = "currency-intelligence-\(ISO8601DateFormatter().string(from: Date()).prefix(10)).json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do { try data.write(to: url, options: .atomic); exportURL = url } catch { model.notice = "Export failed: \(error.localizedDescription)" }
    }
}
