// swift-tools-version: 5.9
// 未ビルド: この環境(Linux, Swiftツールチェーンなし)では検証していません。
// macOS + Xcode で `swift test` を実行して確認してください。BLOCKERS.md B-01 参照。
import PackageDescription

let package = Package(
    name: "CoreMoney",
    platforms: [.iOS(.v17), .macOS(.v14), .watchOS(.v10)],
    products: [
        .library(name: "CoreMoney", targets: ["CoreMoney"]),
    ],
    targets: [
        .target(name: "CoreMoney"),
        .testTarget(name: "CoreMoneyTests", dependencies: ["CoreMoney"]),
    ]
)
