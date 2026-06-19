# KZP — an on-chain contribution circle (esusu / ajo)

**Live demo:** https://web-ten-liart-30.vercel.app

A savings/contribution circle implemented as a Solana program, in the spirit of the Polish
**Kasa Zapomogowo-Pożyczkowa (KZP)** and West-African **esusu / ajo**: members pool money over
time and draw value from the shared flow. Each deposit splits in two — **50% flows *down*** to
everyone who joined earlier (by their share of the pool) and **50% is gifted *up*** to the very
next depositor — so no one ever lands on $0. The first member's down-half seeds a **locked floor**.

## How this friction works in traditional systems

Informal contribution circles (esusu, ajo, tanda, KZP relief funds) are used by hundreds of
millions of people, but they run entirely on **trust and a human organizer**:

- The organizer holds the pooled cash — you trust them not to abscond.
- The split/rotation is tracked in someone's notebook — you trust the bookkeeping.
- There is **no enforcement**: if a member stops contributing or the organizer disappears,
  participants have no recourse.

It works among close-knit groups and breaks down at any scale or distance.

## How this works on Solana

| Friction | On-chain guarantee |
|----------|--------------------|
| Organizer holds the cash | Funds live in a **PDA escrow**; no human ever has custody. |
| Trust the bookkeeping | Every split is computed and recorded by the program. The DOWN flow uses a **reward-per-share index** (`acc_per_deposit`), the standard staking-rewards pattern, so each deposit settles in **O(1)** without iterating members. |
| The up-gift | Each deposit reserves its up-half on-chain; the **next depositor receives it atomically** on their deposit, guaranteeing no one nets $0 at deposit time. |
| Withdrawals | A member's claimable balance accrues automatically; `withdraw` pays it out from escrow, signed by the circle PDA. |

Permissionless (anyone opens or joins), token-native (USDC), and trustless where it matters:
nobody trusts an organizer, custody is the program's, and the math is verifiable on-chain.

## Architecture & account model

- **`Circle`** (PDA, seeds `["circle", authority]`) — `authority`, `mint`, `pool_total`,
  `acc_per_deposit` (reward-per-share index, 1e12-scaled), `floor` (locked), `up_reserve`.
- **`Member`** (PDA, seeds `["member", circle, owner]`) — `deposited` (share basis),
  `reward_checkpoint`, `balance` (claimable).
- **`escrow`** — an associated token account owned by the `Circle` PDA; holds the pooled USDC.
- Instructions:
  - `open_circle` / `join`
  - `deposit(amount)` — settles the depositor, pays them the standing up-gift, splits the new
    deposit DOWN (credited to earlier members via `acc_per_deposit`) and UP (reserved for the
    next depositor); the first deposit seeds the floor.
  - `withdraw` — settles and pays out the member's accrued balance.
- Events: `Deposited`, `Withdrawn`.

The reward-per-share index is the core trick: instead of looping over members on every deposit,
`acc_per_deposit += down / other_total`, and each member's down-earnings = `deposited ×
(acc_per_deposit − checkpoint)`. Constant time, exact, no crank.

## Tradeoffs & constraints (honest)

- **It is contribution-funded — early and ongoing depositors are favored.** Half of every
  deposit pays members who joined earlier, so position and continued participation are rewarded.
  This is the genuine shape of a rotating contribution circle, stated plainly rather than dressed
  up: like any esusu/ajo, **it keeps paying only while contributions keep flowing, and it unwinds
  if they stop.** It is not a guaranteed-return instrument.
- **The floor is permanent.** The first member's down-half is locked forever as a pool floor,
  never withdrawn — a fixed cost the circle carries.
- **Queue/up-gift is sequential, not oracular.** All flows are funded by real deposits; no oracle
  and no external yield are involved. The chain guarantees custody, the exact split, and the
  bookkeeping — not that the stream continues.
- **No scheduler.** Deposits and withdrawals are user-initiated transactions; nothing auto-fires.

## Devnet

- **Program ID:** [`6EvXiKocGuqDGQcNR3jFKJutWoVr5Qiips5hm2AfngpV`](https://explorer.solana.com/address/6EvXiKocGuqDGQcNR3jFKJutWoVr5Qiips5hm2AfngpV?cluster=devnet)
- **Deploy transaction:** [`25vwe7…iZCm`](https://explorer.solana.com/tx/25vwe7L6PByrXpj7GBUpbV3dA5NHM6pJTEk6HGGofMd74NoFHZ7nDcpU87wTmX9m3hfeDCxm5Lfo7sRdACn2iZCm?cluster=devnet)
- **Live instruction transactions** (produced by `playground-native/client/demo.mjs` against the deployed program):
  - `deposit` (member 2 contributes; 50% splits down to the earlier member, 50% reserves up): [`3LsJLL…SztuQ`](https://explorer.solana.com/tx/3LsJLLDb9dHquEUgbvLsAh9n3sGqpTebsEM3UP1VU9uNhfRV8Qx2E9BTP2DfjEAsAhCHSoNsoL2wAXrqWBuSztuQ?cluster=devnet)
  - `withdraw` (member 1 pulls the down-split they earned out of escrow): [`3V4GsU…DfCa4V`](https://explorer.solana.com/tx/3V4GsUqmJn3rMBMTJACNM744SdrjxeZL5QJfoecP7nnzNc3p7QduhVA4iqhjBYBX2N6mmgJNVWyERCjbDyDfCa4V?cluster=devnet)
- Deployed as the **native** crate in `playground-native/` (small, cheap to deploy), built on the
  latest official toolchain with `cargo build-sbf --arch v3` (the sBPF version devnet enables). The
  on-chain logic is identical to the Anchor implementation in `programs/circle/`.
- **Drive it live:** `playground-native/client/demo.mjs` runs the full flow on devnet (mint → open →
  join ×2 → deposit ×2 → withdraw) and prints an explorer link for every real transaction — see below.

## Run it (testable client)

**Program — the deployed native build (what's on devnet):**
```bash
# latest official Solana toolchain: new Rust compiles every dep, --arch picks a devnet-enabled sBPF
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cd playground-native
cargo build-sbf --arch v3
solana program deploy target/deploy/kzp_circle.so
```

**Or the Anchor implementation (same logic, with tests) in `programs/circle/`:**
```bash
npm install
anchor build && anchor keys sync && anchor build
anchor test          # open/join, floor seeding, up-gift + down-split, withdraw
```
See `SOLANA-DEPLOY-DEBUG-LOG.md` for the full toolchain debugging trail.

**Client demo:**
```bash
cd web && npm install && npm run dev    # http://localhost:3000
```
Deposit, then click "Someone else deposits" to watch earlier members' claimable balances grow
from each new deposit's down-split, and the up-gift pass to the newest depositor.

Devnet only. Unaudited. Built for the "Everyday Real-World Systems as On-Chain Rust Programs" challenge.
