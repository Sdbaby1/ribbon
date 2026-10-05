import { type Abi, type Address, type PublicClient, type TransactionReceipt, decodeEventLog } from "viem";
import { ribbonAbi } from "../abi/Ribbon";
import { usdcAbi } from "../abi/usdc";

const abi = ribbonAbi as unknown as Abi;

export type MemberNet = {
  address: Address;
  net: bigint;
  balance: bigint;
  allowance: bigint;
};

export type ExpenseItem = {
  id: bigint;
  payer: Address;
  amount: bigint;
  timestamp: bigint;
  confirmations: number;
  participantCount: number;
  applied: boolean;
  cancelled: boolean;
  memo: string;
  participants: Address[];
  shares: bigint[];
  confirmedBy: Address[];
};

export type SettleLeg = {
  debtor: Address;
  creditor: Address;
  amount: bigint;
};

export type CircleData = {
  id: bigint;
  creator: Address;
  name: string;
  createdAt: bigint;
  closed: boolean;
  openExpenses: number;
  token: Address;
  members: MemberNet[];
  expenses: ExpenseItem[];
  expenseCount: number;
  legs: SettleLeg[];
};

type CircleTuple = {
  creator: Address;
  name: string;
  createdAt: bigint;
  memberCount: number;
  closed: boolean;
  openExpenses: number;
};

type ExpenseTuple = {
  id: bigint;
  payer: Address;
  amount: bigint;
  timestamp: bigint;
  confirmations: number;
  participantCount: number;
  applied: boolean;
  cancelled: boolean;
  memo: string;
  participants: Address[];
  shares: bigint[];
  confirmedBy: Address[];
};

async function read<T>(client: PublicClient, address: Address, functionName: string, args: readonly unknown[] = []): Promise<T> {
  return client.readContract({ address, abi, functionName, args }) as Promise<T>;
}

export async function loadCircle(client: PublicClient, ribbon: Address, circleId: bigint): Promise<CircleData> {
  const [circleRaw, snapshotRaw, expenseCount, token] = await Promise.all([
    read<unknown>(client, ribbon, "getCircle", [circleId]),
    read<unknown>(client, ribbon, "snapshot", [circleId]),
    read<bigint>(client, ribbon, "expenseCount", [circleId]),
    read<Address>(client, ribbon, "usdc"),
  ]);
  const circle = normalizeCircle(circleRaw);
  const snapshot = normalizeSnapshot(snapshotRaw);

  const offset = expenseCount > 20n ? expenseCount - 20n : 0n;
  const [pageRaw, previewRaw, funds] = await Promise.all([
    read<unknown[]>(client, ribbon, "listExpenses", [circleId, offset, 20n]),
    read<unknown>(client, ribbon, "previewSettle", [circleId]),
    Promise.all(
      snapshot.members.map(async (member) => {
        const [balance, allowance] = await Promise.all([
          client.readContract({
            address: token,
            abi: usdcAbi,
            functionName: "balanceOf",
            args: [member],
          }),
          client.readContract({
            address: token,
            abi: usdcAbi,
            functionName: "allowance",
            args: [member, ribbon],
          }),
        ]);
        return { balance, allowance };
      }),
    ),
  ]);

  const members = snapshot.members.map((address, index) => ({
    address,
    net: snapshot.nets[index] ?? 0n,
    balance: funds[index]?.balance ?? 0n,
    allowance: funds[index]?.allowance ?? 0n,
  }));
  const preview = normalizePreview(previewRaw);
  const legs = preview[0].map((debtor, index) => ({
    debtor,
    creditor: preview[1][index],
    amount: preview[2][index],
  }));

  return {
    id: circleId,
    creator: circle.creator,
    name: circle.name,
    createdAt: circle.createdAt,
    closed: circle.closed,
    openExpenses: Number(circle.openExpenses),
    token,
    members,
    expenses: pageRaw.map((expense) => normalizeExpense(expense)),
    expenseCount: Number(expenseCount),
    legs,
  };
}

export async function loadSummaries(
  client: PublicClient,
  ribbon: Address,
  ids: bigint[],
): Promise<{ id: bigint; name: string; closed: boolean }[]> {
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        const circle = normalizeCircle(await read<unknown>(client, ribbon, "getCircle", [id]));
        return { id, name: circle.name, closed: circle.closed };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((row): row is { id: bigint; name: string; closed: boolean } => row !== null);
}

function normalizeCircle(value: unknown): CircleTuple {
  if (Array.isArray(value)) {
    return {
      creator: value[0] as Address,
      name: value[1] as string,
      createdAt: value[2] as bigint,
      memberCount: Number(value[3]),
      closed: Boolean(value[4]),
      openExpenses: Number(value[5]),
    };
  }
  return value as CircleTuple;
}

function normalizeSnapshot(value: unknown): { members: Address[]; nets: bigint[] } {
  if (Array.isArray(value)) return { members: value[0] as Address[], nets: value[1] as bigint[] };
  return value as { members: Address[]; nets: bigint[] };
}

function normalizePreview(value: unknown): [Address[], Address[], bigint[]] {
  if (Array.isArray(value)) return value as [Address[], Address[], bigint[]];
  const record = value as { debtors: Address[]; creditors: Address[]; amounts: bigint[] };
  return [record.debtors, record.creditors, record.amounts];
}

function normalizeExpense(value: unknown): ExpenseItem {
  const record = (Array.isArray(value)
    ? {
        id: value[0],
        payer: value[1],
        amount: value[2],
        timestamp: value[3],
        confirmations: value[4],
        participantCount: value[5],
        applied: value[6],
        cancelled: value[7],
        memo: value[8],
        participants: value[9],
        shares: value[10],
        confirmedBy: value[11],
      }
    : value) as ExpenseTuple;
  return {
    ...record,
    confirmations: Number(record.confirmations),
    participantCount: Number(record.participantCount),
  };
}

export function inviteFromReceipt(receipt: TransactionReceipt): { circleId: bigint; inviteCode: `0x${string}` } | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "CircleCreated") continue;
      const args = decoded.args as { circleId?: bigint; inviteCode?: `0x${string}` };
      if (args.circleId === undefined || !args.inviteCode) continue;
      return { circleId: args.circleId, inviteCode: args.inviteCode };
    } catch {
      // This log is not a Ribbon event.
    }
  }
  return null;
}
