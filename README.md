# Agent Rewards

USDC escrow on Solana that pays an AI agent for cryptographically-attested outreach work:
find leads, draft per-industry emails (no em dashes, in the user's voice), send batches + follow-ups.

- `programs/agent_rewards/` — the **real** Anchor program (escrow, reward schedule, oracle-signed
  claims, replay protection). Devnet, unaudited.
- `web/` — **mock-first** full-stack Next.js app. Talks to a `RewardsClient` interface; today the
  in-memory `MockRewardsClient`, later a `SolanaRewardsClient` backed by the deployed program.
- `tests/` — Anchor test suite (happy path + replay / wrong-oracle / insufficient-funds rejections).

## Reward schedule (USDC, 6 decimals)
| Work | Unit | Reward |
|------|------|--------|
| Find leads | 10 fetches | 0.001 |
| Draft email template | per industry | 0.0025 |
| Send batch + 1 follow-up | 20 emails | 0.03 |

## Run the web app
```bash
cd web
npm install
npm run dev      # http://localhost:3000
```

## Build / test the program (in a Codespace or Linux)
```bash
npm install
anchor build
anchor keys sync   # replaces the placeholder program id
anchor test
```

## Trust model
A Solana program cannot observe off-chain work. A trusted **oracle** (the backend) co-signs each
`claim_reward` transaction; that signature is the proof. Replay is blocked by a per-nonce PDA. The
`web/` app simulates this in memory so the full flow is demoable before the program is deployed.

Devnet only. Educational.
