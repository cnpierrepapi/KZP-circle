// Base units: 1 USDC = 1_000_000. Mirrors the on-chain program.
export const USDC = 1_000_000;

export const PARAMS = {
  minDeposit: 1 * USDC,
  maxDeposit: 10 * USDC,
  downBps: 5000, // 50% of each deposit flows DOWN to earlier members; 50% is the UP gift
};

export const usdc = (base: number) => (base / USDC).toFixed(2);
