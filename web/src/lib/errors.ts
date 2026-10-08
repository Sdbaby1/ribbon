import { BaseError, ContractFunctionRevertedError } from "viem";
import { formatUsdc, shortenAddress } from "./usdc";

const COPY: Record<string, string> = {
  AlreadyConfirmed: "You already confirmed this expense.",
  AlreadyMember: "That wallet is already in the circle.",
  AmountTooHigh: "That payment is larger than the overlapping debt.",
  BadInvite: "That invite code does not match this circle.",
  BadName: "Use a circle name between 1 and 48 bytes.",
  BadSplit: "Use 2 to 8 people. Equal splits need at least 0.000001 USDC each, and custom shares must add up to the total.",
  BalanceTooLow: "A debtor does not have enough USDC.",
  CircleClosed: "This circle is closed.",
  CircleFull: "A circle holds at most 8 people.",
  DuplicateParticipant: "Each person can appear once in a split.",
  EmptySettle: "There is nothing to settle. Confirm the open expenses first.",
  ExpenseClosed: "That expense is already confirmed or cancelled.",
  MemoTooLong: "Keep the note under 96 bytes.",
  NotCreator: "Only the person who opened the circle can do that.",
  NotMember: "That wallet is not in this circle.",
  NothingOwed: "Those two balances do not form a payment.",
  OpenBalance: "Settle the open balance before leaving or closing.",
  OpenExpense: "Resolve the unconfirmed expense first.",
  PayerNotInSplit: "The person who paid has to be part of the split.",
  Reentered: "The token tried to re-enter Ribbon. The settlement was rejected.",
  TransferFailed: "USDC did not arrive. Nothing was booked.",
  UnknownCircle: "No circle with that id.",
  UnknownExpense: "That expense does not exist.",
  Unbalanced: "The settlement plan did not zero the books, so it was rejected.",
  ZeroAddress: "Ribbon needs the USDC token address.",
  ZeroAmount: "Enter an amount above zero.",
};

export function explainRevert(name: string | undefined, args?: readonly unknown[]): string | null {
  if (!name) return null;
  if ((name === "AllowanceTooLow" || name === "BalanceTooLow") && args && args.length >= 2 && typeof args[1] === "bigint") {
    const who = shortenAddress(String(args[0]));
    const amount = formatUsdc(args[1]);
    if (name === "AllowanceTooLow") {
      return `${who} must approve ${amount} USDC before this circle can settle.`;
    }
    return `${who} needs ${amount} USDC in the wallet. Gas on Arc comes out of the same balance.`;
  }
  return COPY[name] ?? null;
}

export function explainError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const explained = explainRevert(reverted.data?.errorName, reverted.data?.args);
      if (explained) return explained;
    }
    const details = `${error.shortMessage} ${error.details ?? ""} ${error.message}`;
    if (/user rejected|request denied|UserRejected/i.test(details)) {
      return "The wallet closed the request before it was signed.";
    }
    if (/insufficient funds|exceeds.*balance|not enough.*gas/i.test(details)) {
      return "This wallet does not have enough USDC on Arc to pay the transaction fee.";
    }
    if (/transaction underpriced|max fee per gas|fee cap/i.test(details)) {
      return "The wallet proposed a gas fee below Arc's current minimum. Try the transaction again.";
    }
    if (/unknown rpc error/i.test(details)) {
      return "The wallet could not submit the transaction to Arc. Check that its Arc network uses https://rpc.mainnet.arc.io, then try again.";
    }
    if (/http request failed|failed to fetch|network request failed/i.test(details)) {
      return "Your wallet cannot reach Arc. In the wallet's Arc network settings, use chain ID 5042 and RPC URL https://rpc.mainnet.arc.io, then reconnect and try again.";
    }
    return error.shortMessage || "The transaction failed.";
  }
  if (error instanceof Error) {
    if (/user rejected|request denied/i.test(error.message)) {
      return "The wallet closed the request before it was signed.";
    }
    if (/insufficient funds|exceeds.*balance|not enough.*gas/i.test(error.message)) {
      return "This wallet does not have enough USDC on Arc to pay the transaction fee.";
    }
    if (/transaction underpriced|max fee per gas|fee cap/i.test(error.message)) {
      return "The wallet proposed a gas fee below Arc's current minimum. Try the transaction again.";
    }
    if (/unknown rpc error/i.test(error.message)) {
      return "The wallet could not submit the transaction to Arc. Check that its Arc network uses https://rpc.mainnet.arc.io, then try again.";
    }
    if (/http request failed|failed to fetch|network request failed/i.test(error.message)) {
      return "Your wallet cannot reach Arc. In the wallet's Arc network settings, use chain ID 5042 and RPC URL https://rpc.mainnet.arc.io, then reconnect and try again.";
    }
    return error.message;
  }
  return "Something went wrong.";
}
