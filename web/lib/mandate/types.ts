// The client seam. The app talks to this, never to Solana directly. Today the
// in-memory MockMandateClient; later a SolanaMandateClient backed by the deployed
// standing_order program — same shape, nothing else changes.

export interface Pull {
  nonce: number;
  label: string;
  amount: number; // base units
  remaining: number; // escrow after this pull
  at: string;
}

export interface MandateState {
  active: boolean;
  funded: number; // total ever funded
  escrowBalance: number; // remaining in escrow
  providerEarned: number; // total pulled by the provider
  maxPerPeriod: number;
  spentThisPeriod: number;
  periodSecs: number;
  secondsUntilReset: number;
  lowBalanceThreshold: number;
  lowBalance: boolean;
  pulls: Pull[]; // newest first
}

export interface MandateClient {
  getState(): Promise<MandateState>;
  fund(amount: number): Promise<MandateState>;
  // Throws "RateLimitExceeded" | "InsufficientFunds" | "MandateInactive" | "InvalidAmount".
  pull(amount: number, label: string): Promise<Pull>;
  cancel(): Promise<{ refunded: number }>;
  reset(): Promise<void>;
}
