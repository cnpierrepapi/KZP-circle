"use client";

import { useEffect, useState } from "react";

const USDC_DECIMALS = 6;
const usdc = (base: number) => (base / 10 ** USDC_DECIMALS).toFixed(4);

interface WorkClaim {
  nonce: number;
  label: string;
  quantity: number;
  reward: number;
  signature: string;
  at: string;
}
interface RewardsState {
  deposited: number;
  totalRewarded: number;
  vaultBalance: number;
  agentBalance: number;
  claims: WorkClaim[];
}
interface Draft {
  industry: string;
  subject: string;
  body: string;
  hasEmDash: boolean;
}

export default function Home() {
  const [state, setState] = useState<RewardsState | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setState(await (await fetch("/api/state")).json());
  useEffect(() => {
    refresh();
  }, []);

  const deposit = async () => {
    setBusy(true);
    await fetch("/api/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 1_000_000 }), // 1 USDC
    });
    await refresh();
    setBusy(false);
  };

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/run", { method: "POST" }).then((r) => r.json());
    setDrafts(res.drafts ?? []);
    setSkipped(res.skipped ?? []);
    setState(res.state ?? null);
    setBusy(false);
  };

  const reset = async () => {
    setBusy(true);
    setDrafts([]);
    setSkipped([]);
    setState(await (await fetch("/api/reset", { method: "POST" })).json());
    setBusy(false);
  };

  return (
    <main className="wrap">
      <h1>Agent Rewards</h1>
      <p className="sub">
        Escrow USDC. An AI agent finds leads, drafts per-industry emails (no em dashes), and sends
        batches. The vault pays the agent per attested unit of work. Mock mode: the on-chain program
        is swapped in later behind the same interface.
      </p>

      <div className="grid">
        <div className="card">
          <div className="k">Vault (escrow)</div>
          <div className="v">{state ? usdc(state.vaultBalance) : "0.0000"}</div>
        </div>
        <div className="card">
          <div className="k">Agent earned</div>
          <div className="v green">{state ? usdc(state.agentBalance) : "0.0000"}</div>
        </div>
        <div className="card">
          <div className="k">Deposited</div>
          <div className="v blue">{state ? usdc(state.deposited) : "0.0000"}</div>
        </div>
      </div>

      <div className="row">
        <button onClick={deposit} disabled={busy}>
          Deposit 1 USDC
        </button>
        <button onClick={run} disabled={busy} className="secondary">
          {busy ? "Working..." : "Run agent"}
        </button>
        <button onClick={reset} disabled={busy} className="ghost">
          Reset
        </button>
      </div>

      {skipped.length > 0 && (
        <p className="note warn">
          Vault ran dry, skipped {skipped.length} unit(s): {skipped.join(", ")}. Deposit more to
          cover them.
        </p>
      )}

      <div className="section">
        <h2>Drafts (per industry, em-dash free)</h2>
        {drafts.length === 0 ? (
          <div className="empty">Run the agent to generate drafts.</div>
        ) : (
          drafts.map((d) => (
            <div className="draft" key={d.industry}>
              <span className="ind">{d.industry}</span>
              {!d.hasEmDash && <span className="badge ok">no em dash</span>}
              <div className="body">
                <strong>{d.subject}</strong>
                <br />
                {d.body}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section">
        <h2>Reward claims</h2>
        {!state || state.claims.length === 0 ? (
          <div className="empty">No claims yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Work</th>
                <th>Qty</th>
                <th>Reward (USDC)</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {state.claims.map((c) => (
                <tr key={c.nonce}>
                  <td className="mono">{c.nonce}</td>
                  <td>{c.label}</td>
                  <td>{c.quantity}</td>
                  <td className="reward">{usdc(c.reward)}</td>
                  <td className="mono">{c.signature}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="note">
        Trust model: in production a deployed Solana program holds the escrow and a trusted oracle
        co-signs each claim. Here that logic runs in memory so the full flow is demoable without the
        chain. See the program in <span className="mono">programs/agent_rewards/src/lib.rs</span>.
      </p>
    </main>
  );
}
