// The seam. The whole app talks to this interface, never to Solana directly.
// Today: MockRewardsClient (in-memory). Later: SolanaRewardsClient (same shape,
// backed by the deployed Anchor program). Swapping one for the other touches
// nothing else in the app.

export interface WorkClaim {
  nonce: number;
  workType: number;
  label: string;
  quantity: number;
  reward: number; // base units
  signature: string; // mock id now; real tx signature later
  at: string;
}

export interface RewardsState {
  deposited: number; // base units
  totalRewarded: number;
  vaultBalance: number; // deposited - totalRewarded
  agentBalance: number; // == totalRewarded in this model
  claims: WorkClaim[]; // newest first
}

export interface RewardsClient {
  getState(): Promise<RewardsState>;
  deposit(amount: number): Promise<RewardsState>; // base units
  claim(workType: number, label: string, quantity: number): Promise<WorkClaim>;
  reset(): Promise<void>;
}
