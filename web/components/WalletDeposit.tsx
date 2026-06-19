"use client";

import { useState } from "react";
import { realDeposit, explorerTx, getProvider } from "../lib/circle/onchain";

// "Connect wallet → make a real deposit": a single-user, genuinely on-chain action against the
// deployed devnet program. Unlike the mock feed above (simulated signatures), every signature
// here is a real Solana transaction with a working explorer link.
export default function WalletDeposit() {
  const [amount, setAmount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [links, setLinks] = useState<{ label: string; sig: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setBusy(true);
    setLogs([]);
    setLinks([]);
    const add = (m: string) => setLogs((l) => [...l, m]);
    try {
      if (!getProvider()) {
        setError("No Solana wallet detected. Install Phantom (phantom.app), then reload.");
        return;
      }
      const res = await realDeposit(amount, add);
      const collected = [
        ...res.setupSigs,
        { label: res.firstTime ? "deposit (real, on-chain)" : "deposit again (real)", sig: res.depositSig },
      ];
      setLinks(collected);
      add("done — this is a real devnet transaction.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <h2>Try it for real on devnet</h2>
      <p className="note">
        The activity above is an in-memory simulation. This button talks to the{" "}
        <span className="mono">deployed</span> program on devnet: connect Phantom and it mints you a
        demo token, opens <em>your own</em> circle, and makes a real{" "}
        <span className="mono">deposit</span> — each signature below opens on Solana Explorer.
      </p>
      <div className="row">
        <input
          type="range"
          min={1}
          max={5}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={busy}
        />
        <button onClick={run} disabled={busy}>
          {busy ? "Signing on devnet…" : `Connect wallet → deposit ${amount} token${amount > 1 ? "s" : ""}`}
        </button>
      </div>

      {logs.length > 0 && (
        <div className="empty" style={{ textAlign: "left" }}>
          {logs.map((l, i) => (
            <div key={i} className="mono" style={{ fontSize: 12, opacity: 0.85 }}>
              {l}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="note" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}

      {links.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Real transaction</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="mono">
                  <a href={explorerTx(l.sig)} target="_blank" rel="noreferrer">
                    {l.sig.slice(0, 8)}…{l.sig.slice(-6)} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="note">
        Devnet only, demo token (not USDC). Needs a wallet with a little devnet SOL — if the
        in-app airdrop is rate-limited, fund your address at{" "}
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
          faucet.solana.com
        </a>{" "}
        and click again. Re-clicking deposits again into the same circle, so balances actually move.
      </p>
    </div>
  );
}
