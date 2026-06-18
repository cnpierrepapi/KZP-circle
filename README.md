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

- Program ID: `<filled after deploy>`
- Example transactions: open + join `<tx>` · first deposit (floor seeded) `<tx>` · second deposit
  (up-gift + down-split) `<tx>` · withdraw `<tx>`

## Run it (testable client)

**Program (Codespace or Linux):**
```bash
npm install
anchor build && anchor keys sync && anchor build
anchor test          # open/join, floor seeding, up-gift + down-split, withdraw
anchor deploy --provider.cluster devnet
```

**Client demo:**
```bash
cd web && npm install && npm run dev    # http://localhost:3000
```
Deposit, then click "Someone else deposits" to watch earlier members' claimable balances grow
from each new deposit's down-split, and the up-gift pass to the newest depositor.

Devnet only. Unaudited. Built for the "Everyday Real-World Systems as On-Chain Rust Programs" challenge.
