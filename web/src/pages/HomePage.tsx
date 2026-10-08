import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, parseGwei } from "viem";
import { ribbonAbi } from "../abi/Ribbon";
import { arc } from "../chain";
import { ribbonAddress } from "../config";
import { SetupNotice } from "../components/SetupNotice";
import { explainError } from "../lib/errors";
import { formatInvite, parseInvite, randomSalt } from "../lib/invite";
import { inviteFromReceipt, loadSummaries } from "../lib/loadCircle";
import { rememberCircle, readSeenCircles, saveInvite } from "../lib/storage";
import { utf8Size } from "../lib/usdc";

const MIN_ARC_MAX_FEE = parseGwei("21");

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
      const args = [trimmed, randomSalt()] as const;
      const [balance, estimatedGas, estimatedFees] = await Promise.all([
        client.getBalance({ address: address! }),
        client.estimateContractGas({
          address: ribbonAddress,
          abi: ribbonAbi,
          functionName: "createCircle",
          args,
          account: address!,
        }),
        client.estimateFeesPerGas(),
      ]);
      const maxFeePerGas = estimatedFees.maxFeePerGas > MIN_ARC_MAX_FEE ? estimatedFees.maxFeePerGas : MIN_ARC_MAX_FEE;
      const gas = estimatedGas + estimatedGas / 5n;
      const maximumGasCost = gas * maxFeePerGas;
      if (balance < maximumGasCost) {
        throw new Error(
          `This wallet needs about ${formatGasUsdc(maximumGasCost)} USDC on Arc for gas. Its Arc balance is ${formatGasUsdc(balance)} USDC.`,
        );
      }
      await client.simulateContract({
        address: ribbonAddress,
        abi: ribbonAbi,
        functionName: "createCircle",
        args,
        account: address!,
        gas,
        maxFeePerGas,
        maxPriorityFeePerGas: estimatedFees.maxPriorityFeePerGas,
      });
      const hash = await writeContractAsync({
        address: ribbonAddress,
        abi: ribbonAbi,
        functionName: "createCircle",
        args,
        chainId: arc.id,
        gas,
        maxFeePerGas,
        maxPriorityFeePerGas: estimatedFees.maxPriorityFeePerGas,
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
        <div className="hero-copy">
          <p className="eyebrow">Shared expense ledger on Arc mainnet</p>
          <h1>Settle shared expenses in USDC.</h1>
          <p className="lede">
            Create a circle for two to eight people. Record what someone paid, let each participant confirm their share,
            then settle the net balance directly between wallets on Arc. Ribbon never holds funds.
          </p>
          <ol className="steps">
            <li className="step">
              <span className="step-index">Step 1</span>
              <h2>Create the circle</h2>
              <p>Name the group and share its invite with the people splitting costs.</p>
            </li>
            <li className="step">
              <span className="step-index">Step 2</span>
              <h2>Confirm each expense</h2>
              <p>Record a payment. Everyone included in the split confirms the exact shares.</p>
            </li>
            <li className="step">
              <span className="step-index">Step 3</span>
              <h2>Settle the balance</h2>
              <p>Debtors pay creditors directly in USDC after the group confirms its expenses.</p>
            </li>
          </ol>
        </div>
        <aside className="paper network-note">
          <p className="eyebrow dark">Built for small trusted groups</p>
          <h2>Why it is on Arc</h2>
          <p>
            Arc uses USDC for gas, so members do not need a second token to repay a small balance. Ribbon reads the ledger
            from contract storage because Arc's public RPC limits log queries to 10,000 blocks.
          </p>
          <dl className="facts">
            <div><dt>Network</dt><dd>Arc mainnet</dd></div>
            <div><dt>Asset</dt><dd>USDC</dd></div>
            <div><dt>Custody</dt><dd>Your wallet</dd></div>
          </dl>
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
          <p>Create the shared ledger. Your wallet will ask you to confirm the transaction.</p>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="actions">
            <button className="button seal" type="submit" aria-busy={pending} disabled={!ready || pending || name.trim().length === 0}>
              {pending ? "Waiting for wallet" : "Create on Arc"}
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
          <p>Paste the complete invite from a circle member. Joining is an onchain transaction.</p>
          <label>
            Invite
            <input value={invite} onChange={(event) => setInvite(event.target.value)} spellCheck={false} />
          </label>
          <div className="actions">
            <button className="button" type="submit" aria-busy={pending} disabled={!ready || pending || invite.trim().length === 0}>
              {pending ? "Waiting for wallet" : "Join circle"}
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
      {error ? <p className="error" role="alert">{error}</p> : null}
      {ready ? null : (
        <p className="fine">
          Sample invite shape: {formatInvite(1n, `0x${"ab".repeat(32)}`)}
        </p>
      )}
    </>
  );
}

function formatGasUsdc(value: bigint): string {
  const [whole, fraction = ""] = formatEther(value).split(".");
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}
