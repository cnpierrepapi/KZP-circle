"use client";

import { useEffect, useState } from "react";

const USDC = 1_000_000;
const usd = (b: number) => "$" + (b / USDC).toFixed(2);

interface Member {
  id: string;
  name: string;
  you: boolean;
  order: number;
  deposited: number;
  balance: number;
  withdrawn: number;
}
interface CircleState {
  poolTotal: number;
  floor: number;
  upReserve: number;
  members: Member[];
  you: Member | null;
}

export default function Home() {
  const [s, setS] = useState<CircleState | null>(null);
  const [amount, setAmount] = useState(3);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setS(await (await fetch("/api/state")).json());
  useEffect(() => {
    refresh();
  }, []);

  const post = (url: string, body?: object) =>
    fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json());

  const act = async (fn: () => Promise<CircleState>) => {
    setBusy(true);
    setS(await fn());
    setBusy(false);
  };

  const net = (m: Member) => m.balance + m.withdrawn - m.deposited;
  const you = s?.you;

  return (
    <main className="wrap">
      <h1>KZP — an on-chain contribution circle</h1>
      <p className="sub">
        A Polish-flavored savings circle (inspired by the Kasa Zapomogowo-Pożyczkowa, esusu/ajo).
        Each deposit splits in two: <strong>50% flows down</strong> to everyone who joined earlier,
        split by their share of the pool, and <strong>50% is gifted up</strong> to the very next
        person who deposits — so no one ever lands on $0. The first member&apos;s down-half seeds a
        locked floor. You earn by joining early and by the stream continuing; like any ajo, it only
        keeps paying while contributions keep coming. The Solana program settles every split.
      </p>

      <div className="grid">
        <div className="card">
          <div className="k">Pool</div>
          <div className="v">{s ? usd(s.poolTotal) : "$0.00"}</div>
        </div>
        <div className="card">
          <div className="k">Locked floor</div>
          <div className="v">{s ? usd(s.floor) : "$0.00"}</div>
        </div>
        <div className="card">
          <div className="k">Up-gift for next depositor</div>
          <div className="v blue">{s ? usd(s.upReserve) : "$0.00"}</div>
        </div>
      </div>

      <div className="row">
        <input
          type="range"
          min={1}
          max={10}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={busy}
        />
        <button onClick={() => act(() => post("/api/deposit", { amount: amount * USDC }))} disabled={busy}>
          You deposit ${amount}
        </button>
        <button onClick={() => act(() => post("/api/advance"))} disabled={busy} className="secondary">
          Someone else deposits
        </button>
        <button
          onClick={() => act(() => post("/api/withdraw"))}
          disabled={busy || !you || you.balance === 0}
          className="ghost"
        >
          Withdraw {you ? usd(you.balance) : "$0.00"}
        </button>
        <button onClick={() => act(() => post("/api/reset"))} disabled={busy} className="ghost">
          Reset
        </button>
      </div>
      <p className="note">
        Deposit early, then let others deposit and watch your claimable balance grow from their
        down-splits. The next person to deposit collects the up-gift shown above.
      </p>

      <div className="section">
        <h2>The circle (in join order)</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Member</th>
              <th>Deposited</th>
              <th>Claimable</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {s?.members
              .filter((m) => m.deposited > 0)
              .map((m) => (
                <tr key={m.id} className={m.you ? "self" : ""}>
                  <td className="mono">{m.order}</td>
                  <td>{m.name}</td>
                  <td className="mono">{usd(m.deposited)}</td>
                  <td className="reward">{usd(m.balance)}</td>
                  <td className={net(m) >= 0 ? "reward" : "mono"} style={net(m) < 0 ? { color: "var(--warn)" } : {}}>
                    {net(m) >= 0 ? "+" : ""}
                    {usd(net(m))}
                  </td>
                </tr>
              ))}
            {(!s || s.members.filter((m) => m.deposited > 0).length === 0) && (
              <tr>
                <td colSpan={5} className="empty">
                  No deposits yet. Be the first — your down-half seeds the locked floor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="note">
        On-chain (program <span className="mono">circle</span>): the vault is a PDA escrow; each{" "}
        <span className="mono">deposit</span> credits earlier members&apos; claimable balances by
        share (a constant-time reward-per-share index, no iteration), gifts the up-half to the next
        depositor, and locks the first down-half as the floor. <span className="mono">withdraw</span>{" "}
        pays out your accrued balance. Honest constraint: this is a contribution-funded circle —
        early and ongoing depositors are favored, and it unwinds if deposits stop (the inherent ajo
        risk).
      </p>
    </main>
  );
}
