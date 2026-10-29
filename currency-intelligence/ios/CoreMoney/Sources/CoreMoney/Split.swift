// Mirrors packages/core/src/split.ts. Shares always sum to the total (largest remainder, ties to earlier
// participants). settle() is a proposal that REDUCES the number of transfers (greedy), never claimed minimal.
import Foundation

public struct Share: Hashable, Sendable { public let participantId: String; public let amount: Money; public init(participantId: String, amount: Money) { self.participantId = participantId; self.amount = amount } }
public struct Payment: Hashable, Sendable { public let payerId: String; public let amount: Money; public init(payerId: String, amount: Money) { self.payerId = payerId; self.amount = amount } }
public struct Transfer: Hashable, Sendable, Identifiable { public var id: String { from + ">" + to }; public let from: String; public let to: String; public let amount: Money }

public struct SplitResult: Sendable {
    public let total: Money
    public let shares: [Share]
    /// Participants who absorbed one extra minor unit from rounding.
    public let roundingAbsorbedBy: [String]
}

struct Side {
    let id: String
    var v: Int64
    static func order(_ a: Side, _ b: Side) -> Bool {
        if a.v == b.v { return a.id < b.id }
        return a.v > b.v
    }
}

public enum Split {
    public static func equal(_ total: Money, participants: [String]) throws -> SplitResult {
        try byWeight(total, participants: participants, weights: participants.map { _ in 1 })
    }
    public static func byWeight(_ total: Money, participants: [String], weights: [Int]) throws -> SplitResult {
        guard !participants.isEmpty, participants.count == weights.count else { throw MoneyError.allocation("participants/weights") }
        let amounts = try total.allocate(weights)
        let tw = Int64(weights.reduce(0, +))
        var absorbed: [String] = []
        for (i, w) in weights.enumerated() where amounts[i].minor > total.minor * Int64(w) / tw { absorbed.append(participants[i]) }
        let sum = amounts.reduce(0) { $0 + $1.minor }
        guard sum == total.minor else { throw MoneyError.allocation("shares do not sum to total") }
        return SplitResult(total: total, shares: zip(participants, amounts).map { Share(participantId: $0, amount: $1) }, roundingAbsorbedBy: absorbed)
    }
    /// Greedy largest debtor → largest creditor. Deterministic (ties by id). At most debtors + creditors − 1 transfers.
    public static func settle(_ shares: [Share], payments: [Payment]) throws -> [Transfer] {
        guard let ccy = shares.first?.amount.currency else { return [] }
        var balance: [String: Int64] = [:]
        for s in shares { balance[s.participantId, default: 0] -= s.amount.minor }
        for p in payments { guard p.amount.currency == ccy else { throw MoneyError.currencyMismatch(ccy, p.amount.currency) }; balance[p.payerId, default: 0] += p.amount.minor }
        var debtors: [Side] = []
        var creditors: [Side] = []
        for (id, v) in balance {
            if v < 0 { debtors.append(Side(id: id, v: -v)) } else if v > 0 { creditors.append(Side(id: id, v: v)) }
        }
        debtors.sort(by: Side.order)
        creditors.sort(by: Side.order)
        var out: [Transfer] = []
        var i = 0, j = 0
        while i < debtors.count && j < creditors.count {
            let amt = min(debtors[i].v, creditors[j].v)
            out.append(Transfer(from: debtors[i].id, to: creditors[j].id, amount: try Money(minor: amt, currency: ccy)))
            debtors[i].v -= amt; creditors[j].v -= amt
            if debtors[i].v == 0 { i += 1 }
            if creditors[j].v == 0 { j += 1 }
        }
        return out
    }
}
