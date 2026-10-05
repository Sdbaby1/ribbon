import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ribbonAbi } from "../abi/Ribbon";
import { arc } from "../chain";
import { ribbonAddress } from "../config";
import { SetupNotice } from "../components/SetupNotice";
import { explainError } from "../lib/errors";
import { formatInvite, parseInvite, randomSalt } from "../lib/invite";
import { inviteFromReceipt, loadSummaries } from "../lib/loadCircle";
import { rememberCircle, readSeenCircles, saveInvite } from "../lib/storage";
import { utf8Size } from "../lib/usdc";

export function HomePage() {
  const navigate = useNavigate();
  const { address, isConnected, chainId } = useAccount();
  const client = usePublicClient({ chainId: arc.id });
  const { writeContractAsync } = useWriteContract();
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onArc = chainId === arc.id;

  const mine = useQuery({
    queryKey: ["circles-of", ribbonAddress, address],
    enabled: Boolean(client && ribbonAddress && address),
    queryFn: async () => {
      const ids = (await client!.readContract({
        address: ribbonAddress!,
        abi: ribbonAbi,
        functionName: "circlesOf",
        args: [address!],
      })) as bigint[];
      return ids.map((id) => id.toString());
    },
  });

  const ids = useMemo(() => {
    const local = readSeenCircles(arc.id);
    return [...new Set([...(mine.data ?? []), ...local])];
  }, [mine.data]);

  const summaries = useQuery({
    queryKey: ["summaries", ribbonAddress, ids.join(",")],
    enabled: Boolean(client && ribbonAddress && ids.length > 0),
    queryFn: () => loadSummaries(client!, ribbonAddress!, ids.map((id) => BigInt(id))),
  });

  async function createCircle() {
    if (!ribbonAddress || !client) return;
    const trimmed = name.trim();
    if (!trimmed || utf8Size(trimmed) > 48) {
      setError("Use a name between 1 and 48 bytes.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: ribbonAddress,
        abi: ribbonAbi,
        functionName: "createCircle",
        args: [trimmed, randomSalt()],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      const created = inviteFromReceipt(receipt);
      if (!created) throw new Error("The circle was created, but the invite was not in the receipt.");
      saveInvite(arc.id, created.circleId, created.inviteCode);
      rememberCircle(arc.id, created.circleId);
      navigate(`/c/${created.circleId.toString()}`);
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setPending(false);
    }
  }

  async function joinCircle() {
    if (!ribbonAddress || !client) return;
    const parsed = parseInvite(invite);
    if (!parsed) {
      setError("Paste an invite that looks like ribbon:1:0x…");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const matches = (await client.readContract({
        address: ribbonAddress,
        abi: ribbonAbi,
        functionName: "inviteMatches",
        args: [parsed.circleId, parsed.code],
      })) as boolean;
      if (!matches) throw new Error("That invite code does not match this circle.");
      const hash = await writeContractAsync({
        address: ribbonAddress,
        abi: ribbonAbi,
        functionName: "join",
        args: [parsed.circleId, parsed.code],
      });
      await client.waitForTransactionReceipt({ hash });
      saveInvite(arc.id, parsed.circleId, parsed.code);
      rememberCircle(arc.id, parsed.circleId);
      navigate(`/c/${parsed.circleId.toString()}`);
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setPending(false);
    }
  }

  const ready = Boolean(ribbonAddress && isConnected && onArc && client);

  return (
    <>
      <SetupNotice ribbonAddress={ribbonAddress} />
      <section className="hero">
        <div>
          <h1>Close the tab.</h1>
          <p className="lede">
            Ribbon nets who owes whom in a shared USDC circle and settles every balance in one Arc transaction. Gas is
            already USDC, and the receipt is final in under a second, so a small repayment is a normal action.
          </p>
          <div className="steps">
            <article className="step">
              <em>01</em>
              <p>Open a circle and share one invite.</p>
            </article>
            <article className="step">
              <em>02</em>
              <p>Log a payment. Everyone in the split confirms the exact shares.</p>
            </article>
            <article className="step">
              <em>03</em>
              <p>Settle. Debtors pay creditors directly. Ribbon never holds the money.</p>
            </article>
          </div>
        </div>
        <aside className="paper">
          <h2>Why it is on Arc</h2>
          <p>
            On a chain where gas is a volatile token, settling six dollars costs a ceremony. Arc prices the fee in USDC
            and finalizes without a reorg. Ribbon stores the book in the contract because Arc’s public RPC refuses log
            scans longer than 10,000 blocks, about 85 minutes at this block time.
          </p>
        </aside>
      </section>

      <section className="layout">
        <form
          className="paper"
          onSubmit={(event) => {
            event.preventDefault();
            void createCircle();
          }}
        >
          <h2>Open a circle</h2>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="actions">
            <button className="button seal" type="submit" disabled={!ready || pending || name.trim().length === 0}>
              Create on Arc
            </button>
          </div>
        </form>
        <form
          className="paper"
          onSubmit={(event) => {
            event.preventDefault();
            void joinCircle();
          }}
        >
          <h2>Join with an invite</h2>
          <label>
            Invite
            <input value={invite} onChange={(event) => setInvite(event.target.value)} spellCheck={false} />
          </label>
          <div className="actions">
            <button className="button" type="submit" disabled={!ready || pending || invite.trim().length === 0}>
              Join circle
            </button>
          </div>
        </form>
        <section className="paper wide">
          <h2>Your circles</h2>
          {!ribbonAddress ? <p>Deploy the contract to load circles from Arc.</p> : null}
          {ribbonAddress && !isConnected ? <p>Connect the wallet that opened or joined a circle.</p> : null}
          {isConnected && !onArc ? <p>Switch the wallet to Arc. Reads still use the Arc RPC, writes do not.</p> : null}
          <div className="list">
            {(summaries.data ?? []).map((circle) => (
              <Link className="circle-link" key={circle.id.toString()} to={`/c/${circle.id.toString()}`}>
                <strong>{circle.name}</strong>
                <span className="mono">
                  #{circle.id.toString()} {circle.closed ? "· closed" : ""}
                </span>
              </Link>
            ))}
          </div>
          {ids.length === 0 && isConnected && ribbonAddress ? <p>No circles for this wallet yet.</p> : null}
        </section>
      </section>
      {error ? <p className="error">{error}</p> : null}
      {ready ? null : (
        <p className="fine">
          Sample invite shape: {formatInvite(1n, `0x${"ab".repeat(32)}`)}
        </p>
      )}
    </>
  );
}
