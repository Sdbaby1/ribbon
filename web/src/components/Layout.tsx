import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { arc, ARC_CHAIN_ID } from "../chain";
import { saveName } from "../lib/api";
import { explainError } from "../lib/errors";
import { profileMessage } from "../lib/messages";
import { shortenAddress } from "../lib/usdc";

export function Layout({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [displayName, setDisplayName] = useState("");
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const connector = connectors[0];
  const onArc = chainId === ARC_CHAIN_ID;

  async function onSaveName() {
    if (!address) return;
    setNameMessage(null);
    try {
      const issuedAt = Date.now();
      const message = profileMessage(address, displayName.trim(), issuedAt);
      const signature = await signMessageAsync({ message });
      const error = await saveName({
        address,
        displayName: displayName.trim(),
        issuedAt,
        signature,
      });
      setNameMessage(error ?? "Name saved.");
    } catch (error) {
      setNameMessage(explainError(error));
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <Link className="brand" to="/">
          <span className="mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 32 32">
              <path d="M5 8h14c3.2 0 5.5 2.1 5.5 5S22.2 18 19 18H12l9 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <strong>Ribbon</strong>
            <span> USDC tabs on Arc</span>
          </span>
        </Link>
        <div className="top-actions">
          {isConnected && address ? (
            <div className="wallet">
              <span className="mono">{shortenAddress(address)}</span>
              {onArc ? (
                <span className="pill">Arc</span>
              ) : (
                <button className="button seal" type="button" disabled={switching} onClick={() => switchChain({ chainId: arc.id })}>
                  Switch to Arc
                </button>
              )}
              <button className="button ghost" type="button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="button seal"
              type="button"
              disabled={!connector || isPending}
              onClick={() => connector && connect({ connector })}
            >
              {connector ? "Connect wallet" : "No browser wallet found"}
            </button>
          )}
        </div>
      </header>
      {isConnected && address ? (
        <form
          className="paper"
          style={{ marginBottom: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            void onSaveName();
          }}
        >
          <div className="row">
            <label style={{ flex: 1, marginTop: 0 }}>
              Name on this device’s tabs
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} />
            </label>
            <button className="button" type="submit" disabled={displayName.trim().length === 0}>
              Sign and save
            </button>
          </div>
          {nameMessage ? <p className={nameMessage === "Name saved." ? "status" : "error"}>{nameMessage}</p> : null}
        </form>
      ) : null}
      {children}
      <footer>
        Arc chain 5042. Amounts use the 6-decimal USDC contract at{" "}
        <a href="https://explorer.arc.io/address/0x3600000000000000000000000000000000000000">0x3600…0000</a>. Gas is the
        same USDC, shown by wallets at 18 decimals. A circle is a trusted group: balances change only after every person
        in the split confirms, and USDC moves straight from debtor to creditor.
      </footer>
    </div>
  );
}
