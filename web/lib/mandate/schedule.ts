// USDC has 6 decimals. Amounts in base units. The per-work amounts mirror what the
// provider (the agent) pulls per task; the MANDATE config mirrors the on-chain mandate.
export const USDC_DECIMALS = 6;

export const WORK = {
  FIND_LEADS: { id: 0, label: "Find leads", unit: "per 10 fetches", amount: 1_000 },
  DRAFT: { id: 1, label: "Draft pitch", unit: "per industry", amount: 2_500 },
  SEND_BATCH: { id: 2, label: "Send batch + follow-up", unit: "per 20 emails", amount: 30_000 },
} as const;

// Demo mandate: a tight per-period cap so you can SEE the program refuse to overcharge,
// a short period so the standing order visibly "runs" again, and a low-balance threshold.
export const MANDATE = {
  maxPerPeriod: 50_000, // 0.05 USDC the provider may pull per period
  periodSecs: 30, // window length
  lowBalanceThreshold: 80_000, // 0.08 USDC -> LowBalance notification
  fundIncrement: 200_000, // 0.2 USDC per Fund click
};

export const usdc = (base: number) => (base / 10 ** USDC_DECIMALS).toFixed(4);
