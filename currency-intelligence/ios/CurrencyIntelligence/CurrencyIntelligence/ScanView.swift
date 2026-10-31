// Price-tag scanner (F05). VisionKit's DataScanner reads numbers from the camera; the user taps a candidate and
// CONFIRMS it — nothing is entered automatically, and low-confidence/unsupported states are shown plainly.
// Photos never leave the device (no upload). The simulator has no camera, so it shows the unsupported state.
import SwiftUI
import VisionKit

struct ScanView: View {
    @Environment(\.dismiss) private var dismiss
    let onPick: (String) -> Void
    @State private var candidates: [String] = []
    @State private var selected: String? = nil
    var supported: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                if supported {
                    ScannerRepresentable(candidates: $candidates).frame(maxHeight: .infinity).clipShape(RoundedRectangle(cornerRadius: 16))
                    Text(L("Point the camera at a price. Tap a number to use it.")).font(.footnote).foregroundStyle(.secondary)
                } else {
                    Spacer()
                    Image(systemName: "camera.badge.ellipsis").font(.largeTitle).foregroundStyle(.secondary)
                    Text(L("Camera not available on this device")).font(.headline)
                    Text(L("Price scanning needs a camera and iOS 16 or later. Nothing is uploaded; recognised numbers are only suggestions you confirm.")).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
                    Spacer()
                }
                if !candidates.isEmpty {
                    ScrollView(.horizontal) {
                        HStack { ForEach(candidates, id: \.self) { c in Button(c) { selected = c }.buttonStyle(.bordered).tint(selected == c ? .blue : .gray) } }
                    }
                }
                if let s = selected {
                    Button("\(L("Use")) \(s)") { onPick(s); dismiss() }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
                }
            }
            .padding()
            .navigationTitle(L("Scan a price tag"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("Close")) { dismiss() } } }
        }
    }
}

struct ScannerRepresentable: UIViewControllerRepresentable {
    @Binding var candidates: [String]
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.text(textContentType: nil)], qualityLevel: .balanced, recognizesMultipleItems: true, isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }
    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let parent: ScannerRepresentable
        init(_ p: ScannerRepresentable) { parent = p }
        func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) { extract(allItems) }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) { extract(allItems) }
        func extract(_ items: [RecognizedItem]) {
            var found: [String] = []
            for item in items { if case .text(let t) = item {
                for m in t.transcript.matches(of: #/\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,3})?|\d+/#) {
                    let raw = String(m.output).replacingOccurrences(of: ",", with: "")
                    if let v = Double(raw), v > 0, !found.contains(raw) { found.append(raw) }
                } } }
            DispatchQueue.main.async { self.parent.candidates = Array(found.prefix(8)) }
        }
    }
}
