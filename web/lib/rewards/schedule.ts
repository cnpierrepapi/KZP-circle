// USDC has 6 decimals. Rewards are in base units, MIRRORING the on-chain program
// constants in ../../programs/agent_rewards/src/lib.rs. Keep these in sync.
export const USDC_DECIMALS = 6;

export const WORK = {
  FIND_LEADS: { id: 0, label: "Find leads", unit: "per 10 fetches", reward: 1_000 },
  DRAFT: { id: 1, label: "Draft template", unit: "per industry template", reward: 2_500 },
  SEND_BATCH: { id: 2, label: "Send batch + follow-up", unit: "per 20 emails", reward: 30_000 },
} as const;

export type WorkDef = (typeof WORK)[keyof typeof WORK];

export function rewardFor(workType: number): WorkDef {
  const w = Object.values(WORK).find((x) => x.id === workType);
  if (!w) throw new Error("Unknown work type");
  return w;
}

// base units -> human USDC string
export const usdc = (base: number) => (base / 10 ** USDC_DECIMALS).toFixed(4);
