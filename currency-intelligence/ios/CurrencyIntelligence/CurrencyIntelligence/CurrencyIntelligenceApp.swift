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
            HomeView().tabItem { Label(L("Home"), systemImage: "house") }
            CardsView().tabItem { Label(L("Cards"), systemImage: "creditcard") }
            ConvertView().tabItem { Label(L("Convert"), systemImage: "arrow.left.arrow.right") }
            MoreView().tabItem { Label(L("More"), systemImage: "ellipsis.circle") }
        }
        // Decimal pads have no return key; without this the keyboard covers the tab bar with no way to close it.
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(L("Done")) { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            }
        }
        .alert("Notice", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
    }
}
