"use client";

import { useEffect, useState } from "react";

const USDC_DECIMALS = 6;
const usdc = (base: number) => (base / 10 ** USDC_DECIMALS).toFixed(4);

interface Pull {
  nonce: number;
  label: string;
  amount: number;
  remaining: number;
}
interface MandateState {
  active: boolean;
  funded: number;
  escrowBalance: number;
  providerEarned: number;
  maxPerPeriod: number;
  spentThisPeriod: number;
  periodSecs: number;
  secondsUntilReset: number;
  lowBalanceThreshold: number;
  lowBalance: boolean;
  pulls: Pull[];
}
interface WorkResult {
  label: string;
  amount: number;
  status: string;
}
interface Draft {
  industry: string;
  city: string;
  subject: string;
  body: string;
  model: string;
  hasEmDash: boolean;
}
interface Lead {
  name: string;
  industry: string;
  category: string;
  area: string;
  rating: number;
  reviews: number;
}

export default function Home() {
  const [state, setState] = useState<MandateState | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [results, setResults] = useState<WorkResult[]>([]);
  const [refunded, setRefunded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setState(await (await fetch("/api/state")).json());
  useEffect(() => {
    refresh();
  }, []);

  const fund = async () => {
    setBusy(true);
    setRefunded(null);
    await fetch("/api/fund", { method: "POST" });
    await refresh();
    setBusy(false);
  };

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/run", { method: "POST" }).then((r) => r.json());
    setLeads(res.leads ?? []);
    setDrafts(res.drafts ?? []);
    setResults(res.results ?? []);
    setState(res.state ?? null);
    setBusy(false);
  };

  const cancel = async () => {
    setBusy(true);
    const res = await fetch("/api/cancel", { method: "POST" }).then((r) => r.json());
    setRefunded(res.refunded ?? 0);
    setState(res.state ?? null);
    setBusy(false);
  };

  const reset = async () => {
    setBusy(true);
    setLeads([]);
    setDrafts([]);
    setResults([]);
    setRefunded(null);
    setState(await (await fetch("/api/reset", { method: "POST" })).json());
    setBusy(false);
  };

  return (
    <main className="wrap">
      <h1>Standing Order</h1>
      <p className="sub">
        The subscription that can&apos;t overcharge you. Grammarly takes your full $30 up front and
        keeps it if you cancel. Here you fund an escrow once, the provider pulls only as it serves
        you (never above the per-period cap), unused funds roll over and never expire, and cancelling
        refunds every cent that was not used. Demo provider: an AI outreach agent working real Warsaw
        leads.
      </p>

      {state?.lowBalance && state.active && (
        <p className="note warn">
          ⚠ LowBalance event: escrow {usdc(state.escrowBalance)} USDC is below the{" "}
          {usdc(state.lowBalanceThreshold)} threshold. On-chain this is an emitted notification.
        </p>
      )}
      {refunded !== null && (
        <p className="note ok-note">
          ✓ Cancelled. Refunded {usdc(refunded)} USDC of unused balance back to you. The provider
          only kept what it actually pulled.
        </p>
      )}

      <div className="grid">
        <div className="card">
          <div className="k">Your escrow</div>
          <div className="v">{state ? usdc(state.escrowBalance) : "0.0000"}</div>
        </div>
        <div className="card">
          <div className="k">Provider took</div>
          <div className="v blue">{state ? usdc(state.providerEarned) : "0.0000"}</div>
        </div>
        <div className="card">
          <div className="k">Cap used this period</div>
          <div className="v green">
            {state ? `${usdc(state.spentThisPeriod)} / ${usdc(state.maxPerPeriod)}` : "0 / 0"}
          </div>
        </div>
      </div>

      <div className="row">
        <button onClick={fund} disabled={busy || (state ? !state.active : false)}>
          Fund 0.2 USDC
        </button>
        <button onClick={run} disabled={busy || (state ? !state.active : false)} className="secondary">
          {busy ? "Working..." : "Run agent"}
        </button>
        <button onClick={cancel} disabled={busy || (state ? !state.active : false)} className="ghost">
          Cancel &amp; refund
        </button>
        <button onClick={reset} disabled={busy} className="ghost">
          Reset
        </button>
      </div>

      {state && state.active && (
        <p className="note">
          Period cap resets in ~{state.secondsUntilReset}s. The provider cannot exceed{" "}
          {usdc(state.maxPerPeriod)} USDC per period no matter how much work it claims, which is why
          some pulls below are refused.
        </p>
      )}

      {results.length > 0 && (
        <div className="section">
          <h2>This run</h2>
          <table>
            <thead>
              <tr>
                <th>Work</th>
                <th>Amount (USDC)</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.label}</td>
                  <td className="reward">{usdc(r.amount)}</td>
                  <td>
                    {r.status === "paid" ? (
                      <span className="badge ok">paid</span>
                    ) : (
                      <span className="badge warnbadge">{r.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leads.length > 0 && (
        <div className="section">
          <h2>Leads found — Warsaw, Poland ({leads.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Category</th>
                <th>Area</th>
                <th>Rating</th>
                <th>Reviews</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td className="mono">{l.category}</td>
                  <td className="mono">{l.area}</td>
                  <td>{l.rating}</td>
                  <td>{l.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="section">
          <h2>Pitches (per industry, Sonnet-written, em-dash free)</h2>
          {drafts.map((d) => (
            <div className="draft" key={d.industry}>
              <span className="ind">{d.industry}</span>
              <span className="badge">{d.model}</span>
              {!d.hasEmDash && <span className="badge ok">no em dash</span>}
              <div className="body">
                <strong>{d.subject}</strong>
                <br />
                {d.body}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <h2>Pulls</h2>
        {!state || state.pulls.length === 0 ? (
          <div className="empty">No pulls yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Work</th>
                <th>Amount (USDC)</th>
                <th>Escrow after</th>
              </tr>
            </thead>
            <tbody>
              {state.pulls.map((p) => (
                <tr key={p.nonce}>
                  <td className="mono">{p.nonce}</td>
                  <td>{p.label}</td>
                  <td className="reward">{usdc(p.amount)}</td>
                  <td className="mono">{usdc(p.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="note">
        On-chain (program <span className="mono">standing_order</span>): escrow lives in a PDA you
        control, the per-period cap is enforced by <span className="mono">pull</span>,{" "}
        <span className="mono">cancel</span> refunds the remainder, and a{" "}
        <span className="mono">LowBalance</span> event fires below the threshold. This page runs that
        logic in memory; set <span className="mono">ANTHROPIC_API_KEY</span> for real Sonnet pitches.
      </p>
    </main>
  );
}
