import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ribbonAbi } from "../abi/Ribbon";
import { usdcAbi } from "../abi/usdc";
import { explorerTx } from "../chain";
import { arc } from "../chain";
import { ribbonAddress } from "../config";
import { Identity } from "../components/Identity";
import { SetupNotice } from "../components/SetupNotice";
import { fetchNames } from "../lib/api";
import { explainError } from "../lib/errors";
import { formatInvite } from "../lib/invite";
import { inviteFromReceipt, loadCircle, type CircleData } from "../lib/loadCircle";
import { equalSplit, netsAfterSplit } from "../lib/split";
import { readInvite, saveInvite } from "../lib/storage";
import { formatUsdc, parseUsdc, shortenAddress, utf8Size } from "../lib/usdc";

export function CirclePage() {
  const params = useParams();
  const valid = Boolean(params.circleId && /^[1-9]\d*$/.test(params.circleId));
  const circleId = valid ? BigInt(params.circleId as string) : null;

  if (!valid || circleId === null) {
    return (
      <section className="paper">
        <h2>That circle id is not a number.</h2>
        <Link to="/">Back home</Link>
      </section>
    );
  }

  return <CircleScreen circleId={circleId} />;
}

function CircleScreen({ circleId }: { circleId: bigint }) {
  const queryClient = useQueryClient();
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: arc.id });
  const { writeContractAsync } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<string | null>(() => readInvite(arc.id, circleId));
  const [recoverHash, setRecoverHash] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [custom, setCustom] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean> | null>(null);
  const [shares, setShares] = useState<Record<string, string>>({});

  const circle = useQuery({
    queryKey: ["circle", ribbonAddress, circleId.toString()],
    enabled: Boolean(client && ribbonAddress),
    queryFn: () => loadCircle(client!, ribbonAddress!, circleId),
  });

  const nameQuery = useQuery({
    queryKey: ["names", circle.data?.members.map((member) => member.address.toLowerCase()).join(",")],
    enabled: Boolean(circle.data && circle.data.members.length > 0),
    queryFn: () => fetchNames(circle.data?.members.map((member) => member.address) ?? []),
  });
  const names = nameQuery.data ?? {};
  const onArc = chainId === arc.id;
  const me = address?.toLowerCase();

  async function send(label: string, action: () => Promise<Hash>) {
    if (!client) {
      setError("The Arc RPC client is not ready.");
      return null;
    }
    setPending(true);
    setError(null);
    setHash(null);
    setStatus(`${label}. Confirm it in your wallet.`);
    try {
      const txHash = await action();
      setHash(txHash);
      setStatus("Waiting for Arc. The receipt is final in under a second.");
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setStatus("Confirmed.");
      await queryClient.invalidateQueries({ queryKey: ["circle", ribbonAddress, circleId.toString()] });
      return receipt;
    } catch (caught) {
      setStatus(null);
      setError(explainError(caught));
      return null;
    } finally {
      setPending(false);
    }
  }

  async function recover() {
    const hashText = recoverHash.trim();
    const looksLikeHash = /^0x[0-9a-fA-F]{64}$/.test(hashText);
    if (!client || !looksLikeHash) {
      setError("Paste the creation transaction hash.");
      return;
    }
    setError(null);
    try {
      const receipt = await client.getTransactionReceipt({ hash: hashText as Hash });
      const found = inviteFromReceipt(receipt);
      if (!found || found.circleId !== circleId) {
        setError("That transaction did not create this circle.");
        return;
      }
      saveInvite(arc.id, circleId, found.inviteCode);
      setInvite(found.inviteCode);
      setStatus("Invite restored on this device.");
    } catch (caught) {
      setError(explainError(caught));
    }
  }

  const data = circle.data;
  const participants = selectedParticipants(data, me, picked);
  let preview: { text: string; shares: bigint[] } | null = null;
  let formError: string | null = null;
  if (data && me && participants.length >= 2 && amount.trim()) {
    try {
      const total = parseUsdc(amount);
      const owed = custom ? customShares(participants, shares) : equalSplit(total, participants.length);
      if (custom && owed.reduce((sum, share) => sum + share, 0n) !== total) {
        formError = `Shares add up to ${formatUsdc(owed.reduce((sum, share) => sum + share, 0n))}. The total is ${formatUsdc(total)}.`;
      } else if (custom && owed.some((share) => share === 0n)) {
        formError = "Each share has to be at least 0.000001 USDC.";
      } else if (utf8Size(memo) > 96) {
        formError = "Keep the note under 96 bytes.";
      } else {
        const nets = netsAfterSplit(me, participants, owed, total);
        const text = [...nets.entries()]
          .map(([who, net]) => `${shortenAddress(who)} ${net >= 0n ? "is owed" : "owes"} ${formatUsdc(net < 0n ? -net : net)}`)
          .join(". ");
        preview = { text, shares: owed };
      }
    } catch (caught) {
      formError = explainError(caught);
    }
  }

  async function addExpense() {
    const contract = ribbonAddress;
    if (!data || !contract || !me || !preview) return;
    const total = parseUsdc(amount);
    const shareArgs: bigint[] = custom ? preview.shares : [];
    await send("Record the expense", () =>
      writeContractAsync({
        address: contract,
        abi: ribbonAbi,
        functionName: "addExpense",
        args: [circleId, total, participants as Address[], shareArgs, memo.trim()],
      }),
    );
  }

  const myDebt = data && me ? debtOf(data, me) : 0n;

  return (
    <>
      <SetupNotice ribbonAddress={ribbonAddress} />
      <div className="header-block">
        <div>
          <Link to="/">All circles</Link>
          <h1>{data?.name ?? `Circle ${circleId.toString()}`}</h1>
          <p className="fine">
            #{circleId.toString()} {data?.closed ? "· closed" : ""} {data ? `· ${data.members.length} members` : ""}
          </p>
        </div>
      </div>
      {circle.isError ? <p className="error">{explainError(circle.error)}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {status ? (
        <p className="status">
          {status} {hash ? <a href={explorerTx(hash)}>View transaction</a> : null}
        </p>
      ) : null}

      <section className="layout">
        <article className="paper">
          <h2>Invite</h2>
          {invite ? (
            <>
              <input readOnly value={formatInvite(circleId, invite as `0x${string}`)} />
              <div className="actions">
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(formatInvite(circleId, invite as `0x${string}`))}
                >
                  Copy invite
                </button>
              </div>
            </>
          ) : (
            <p>The invite is stored on this device when you create or join. You can also restore it from the creation transaction.</p>
          )}
          <label>
            Creation transaction
            <input value={recoverHash} onChange={(event) => setRecoverHash(event.target.value)} spellCheck={false} />
          </label>
          <div className="actions">
            <button className="button ghost" type="button" onClick={() => void recover()}>
              Restore invite
            </button>
          </div>
        </article>

        <article className="paper">
          <h2>Balances</h2>
          <div className="list">
            {(data?.members ?? []).map((member) => (
              <div key={member.address} className={`member ${member.net > 0n ? "credit" : member.net < 0n ? "debt" : ""}`}>
                <Identity address={member.address} names={names} />
                <strong>
                  {member.net === 0n ? "Settled" : member.net > 0n ? `Owed ${formatUsdc(member.net)}` : `Owes ${formatUsdc(-member.net)}`}
                </strong>
              </div>
            ))}
          </div>
          {data?.creator && address?.toLowerCase() === data.creator.toLowerCase() ? (
            <div className="actions">
              <button
                className="button ghost"
                type="button"
                disabled={pending || !onArc || data.closed}
                onClick={() =>
                  void send("Close the circle", () =>
                    writeContractAsync({
                      address: ribbonAddress!,
                      abi: ribbonAbi,
                      functionName: "closeCircle",
                      args: [circleId],
                    }),
                  )
                }
              >
                Close circle
              </button>
              <button
                className="button ghost"
                type="button"
                disabled={pending || !onArc}
                onClick={() =>
                  void send("Leave the circle", () =>
                    writeContractAsync({
                      address: ribbonAddress!,
                      abi: ribbonAbi,
                      functionName: "leave",
                      args: [circleId],
                    }),
                  )
                }
              >
                Leave
              </button>
            </div>
          ) : address ? (
            <div className="actions">
              <button
                className="button ghost"
                type="button"
                disabled={pending || !onArc}
                onClick={() =>
                  void send("Leave the circle", () =>
                    writeContractAsync({
                      address: ribbonAddress!,
                      abi: ribbonAbi,
                      functionName: "leave",
                      args: [circleId],
                    }),
                  )
                }
              >
                Leave
              </button>
            </div>
          ) : null}
        </article>

        <article className="paper">
          <h2>Add an expense</h2>
          <p>You are the payer. Nothing is owed until every selected person confirms.</p>
          <label>
            Amount in USDC
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label>
            Note
            <input value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          <div className="checks">
            {(data?.members ?? []).map((member) => {
              const key = member.address.toLowerCase();
              const locked = key === me;
              const checked = locked || !picked || picked[key] !== false;
              return (
                <label key={member.address}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => {
                      const next: Record<string, boolean> = {};
                      for (const item of data?.members ?? []) {
                        const itemKey = item.address.toLowerCase();
                        next[itemKey] = itemKey === key ? !checked : !picked || picked[itemKey] !== false;
                      }
                      if (me) next[me] = true;
                      setPicked(next);
                    }}
                  />
                  <Identity address={member.address} names={names} />
                </label>
              );
            })}
          </div>
          <label>
            <span className="row">
              <input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />
              Enter exact shares
            </span>
          </label>
          {custom
            ? participants.map((participant) => (
                <div className="split" key={participant}>
                  <Identity address={participant} names={names} />
                  <input
                    inputMode="decimal"
                    value={shares[participant.toLowerCase()] ?? ""}
                    onChange={(event) =>
                      setShares((current) => ({ ...current, [participant.toLowerCase()]: event.target.value }))
                    }
                  />
                </div>
              ))
            : null}
          {preview ? <p className="status">After everyone confirms: {preview.text}.</p> : null}
          {formError ? <p className="error">{formError}</p> : null}
          <div className="actions">
            <button className="button seal" type="button" disabled={!preview || pending || !onArc || data?.closed} onClick={() => void addExpense()}>
              Record expense
            </button>
          </div>
        </article>

        <article className="paper">
          <h2>Settle</h2>
          {data && data.legs.length === 0 ? (
            <p>{data.openExpenses > 0 ? "Waiting on confirmations. USDC cannot move yet." : "The books are clear."}</p>
          ) : null}
          <div className="list">
            {(data?.legs ?? []).map((leg, index) => (
              <div className="leg" key={`${leg.debtor}-${leg.creditor}-${index}`}>
                <span>
                  <Identity address={leg.debtor} names={names} /> pays <Identity address={leg.creditor} names={names} />
                </span>
                <span className="actions">
                  <strong>{formatUsdc(leg.amount)}</strong>
                  {me === leg.debtor.toLowerCase() ? (
                    <button
                      className="button"
                      type="button"
                      disabled={pending || !onArc}
                      onClick={() =>
                        void send("Pay this debt", () =>
                          writeContractAsync({
                            address: ribbonAddress!,
                            abi: ribbonAbi,
                            functionName: "pay",
                            args: [circleId, leg.creditor, leg.amount],
                          }),
                        )
                      }
                    >
                      Pay
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          {data && myDebt > 0n ? (
            <p>
              Your wallet has approved {formatUsdc(allowanceOf(data, me))} of the {formatUsdc(myDebt)} you owe.
            </p>
          ) : null}
          <div className="actions">
            {data && myDebt > 0n && allowanceOf(data, me) < myDebt ? (
              <button
                className="button"
                type="button"
                disabled={pending || !onArc}
                onClick={() =>
                  void send("Approve USDC", () =>
                    writeContractAsync({
                      address: data.token,
                      abi: usdcAbi,
                      functionName: "approve",
                      args: [ribbonAddress!, myDebt],
                    }),
                  )
                }
              >
                Approve {formatUsdc(myDebt)} USDC
              </button>
            ) : null}
            <button
              className="button seal"
              type="button"
              disabled={pending || !onArc || !data || data.legs.length === 0}
              onClick={() =>
                void send("Settle the circle", () =>
                  writeContractAsync({
                    address: ribbonAddress!,
                    abi: ribbonAbi,
                    functionName: "settle",
                    args: [circleId],
                  }),
                )
              }
            >
              Settle circle
            </button>
          </div>
          {data ? <Shortfalls data={data} names={names} me={me} /> : null}
        </article>

        <article className="paper wide">
          <h2>Expenses</h2>
          <div className="list">
            {(data?.expenses ?? []).map((expense) => {
              const confirmed = new Set(expense.confirmedBy.map((item) => item.toLowerCase()));
              const mine = Boolean(me && expense.participants.some((item) => item.toLowerCase() === me));
              const needsMe = Boolean(mine && me && !confirmed.has(me) && !expense.applied && !expense.cancelled);
              return (
                <div className="expense" key={expense.id.toString()}>
                  <div>
                    <strong>{expense.memo || "Expense"}</strong>
                    <p>
                      <Identity address={expense.payer} names={names} /> paid {formatUsdc(expense.amount)}.{" "}
                      {expense.applied ? "Booked." : expense.cancelled ? "Cancelled." : `${expense.confirmations}/${expense.participantCount} confirmed.`}
                    </p>
                    <p className="fine">
                      {expense.participants.map((participant, index) => (
                        <span key={participant}>
                          {shortenAddress(participant)} {formatUsdc(expense.shares[index] ?? 0n)}
                          {index < expense.participants.length - 1 ? " · " : ""}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="actions">
                    {needsMe ? (
                      <button
                        className="button seal"
                        type="button"
                        disabled={pending || !onArc}
                        onClick={() =>
                          void send("Confirm the expense", () =>
                            writeContractAsync({
                              address: ribbonAddress!,
                              abi: ribbonAbi,
                              functionName: "confirmExpense",
                              args: [circleId, expense.id],
                            }),
                          )
                        }
                      >
                        Confirm
                      </button>
                    ) : null}
                    {!expense.applied && !expense.cancelled && (me === expense.payer.toLowerCase() || me === data?.creator.toLowerCase()) ? (
                      <button
                        className="button ghost"
                        type="button"
                        disabled={pending || !onArc}
                        onClick={() =>
                          void send("Cancel the expense", () =>
                            writeContractAsync({
                              address: ribbonAddress!,
                              abi: ribbonAbi,
                              functionName: "cancelExpense",
                              args: [circleId, expense.id],
                            }),
                          )
                        }
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {data && data.expenses.length === 0 ? <p>No expenses yet.</p> : null}
        </article>
      </section>
    </>
  );
}

function Shortfalls({ data, names, me }: { data: CircleData; names: Record<string, string>; me: string | undefined }) {
  const lines = data.members
    .filter((member) => member.net < 0n && member.allowance < -member.net && member.address.toLowerCase() !== me)
    .map((member) => `${names[member.address.toLowerCase()] ?? shortenAddress(member.address)} still needs to approve ${formatUsdc(-member.net)}`);
  if (lines.length === 0) return null;
  return <p>{lines.join(". ")}.</p>;
}

function selectedParticipants(data: CircleData | undefined, me: string | undefined, picked: Record<string, boolean> | null): string[] {
  if (!data || !me) return [];
  return data.members
    .map((member) => member.address)
    .filter((item) => {
      const key = item.toLowerCase();
      if (key === me) return true;
      return !picked || picked[key] !== false;
    });
}

function customShares(participants: string[], shares: Record<string, string>): bigint[] {
  return participants.map((participant) => parseUsdc(shares[participant.toLowerCase()] || "0"));
}

function debtOf(data: CircleData, me: string | undefined): bigint {
  const member = data.members.find((item) => item.address.toLowerCase() === me);
  if (!member || member.net >= 0n) return 0n;
  return -member.net;
}

function allowanceOf(data: CircleData, me: string | undefined): bigint {
  return data.members.find((item) => item.address.toLowerCase() === me)?.allowance ?? 0n;
}
