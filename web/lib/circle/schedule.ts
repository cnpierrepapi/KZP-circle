// Base units: 1 USDC = 1_000_000. Mirrors the on-chain `circle` program constants.
export const USDC = 1_000_000;

export const PARAMS = {
  alphaBps: 1000, // +10% points per consecutive-period streak step
  streakMax: 7, // multiplier caps at 1.7x
  betaMinBps: 1000, // one-off contributor: payout capped at 10% of the vault
  betaMaxBps: 3333, // fully consistent (streak >= streakMax): up to 33.3%
  decayBps: 9000, // miss a period -> keep 90% of points (loss-aversion nudge)
  vMin: 15 * USDC, // payout unlocks once the vault reaches $15
  minContribution: 1 * USDC,
  maxContribution: 10 * USDC,
};

export const usdc = (base: number) => (base / USDC).toFixed(2);
export const multiplierBps = (streak: number) =>
  10_000 + PARAMS.alphaBps * Math.min(streak, PARAMS.streakMax);
// Per-payout cap scales with consistency: 10% (one-off) -> 33.3% (streak >= streakMax)
export const betaBps = (streak: number) => {
  const s = Math.min(Math.max(streak, 0), PARAMS.streakMax);
  return PARAMS.betaMinBps + Math.floor(((PARAMS.betaMaxBps - PARAMS.betaMinBps) * s) / PARAMS.streakMax);
};
