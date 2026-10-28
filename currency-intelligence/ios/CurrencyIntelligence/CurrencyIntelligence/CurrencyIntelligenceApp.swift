// 未ビルド: macOS + Xcode で確認してください(ios/README_MAC.md)。
import SwiftUI

@main
struct CurrencyIntelligenceApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model)
                .task { await model.refreshRates() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        TabView {
            HomeView().tabItem { Label("Home", systemImage: "house") }
            CardsView().tabItem { Label("Cards", systemImage: "creditcard") }
            ConvertView().tabItem { Label("Convert", systemImage: "arrow.left.arrow.right") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .alert("Notice", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
    }
}
