import { RewardsClient, RewardsState, WorkClaim } from "./types";
import { rewardFor } from "./schedule";

// In-memory implementation of the on-chain program's behaviour:
//   deposit -> add to escrow
//   claim   -> pay the agent if the vault can cover it (else InsufficientVaultFunds)
//   nonce   -> monotonic, mirrors the program's replay-guard PDA
class MockRewardsClient implements RewardsClient {
  private deposited = 0;
  private claims: WorkClaim[] = [];
  private nextNonce = 1;

  private snapshot(): RewardsState {
    const totalRewarded = this.claims.reduce((s, c) => s + c.reward, 0);
    return {
      deposited: this.deposited,
      totalRewarded,
      vaultBalance: this.deposited - totalRewarded,
      agentBalance: totalRewarded,
      claims: [...this.claims].reverse(),
    };
  }

  async getState() {
    return this.snapshot();
  }

  async deposit(amount: number) {
    if (amount <= 0) throw new Error("InvalidAmount");
    this.deposited += amount;
    return this.snapshot();
  }

  async claim(workType: number, label: string, quantity: number): Promise<WorkClaim> {
    if (quantity <= 0) throw new Error("InvalidAmount");
    const reward = rewardFor(workType).reward * quantity;
    const totalRewarded = this.claims.reduce((s, c) => s + c.reward, 0);
    if (this.deposited - totalRewarded < reward) throw new Error("InsufficientVaultFunds");

    const nonce = this.nextNonce++;
    const claim: WorkClaim = {
      nonce,
      workType,
      label,
      quantity,
      reward,
      signature: "mock_" + nonce.toString().padStart(6, "0"),
      at: new Date().toISOString(),
    };
    this.claims.push(claim);
    return claim;
  }

  async reset() {
    this.deposited = 0;
    this.claims = [];
    this.nextNonce = 1;
  }
}

// Module singleton so the mock escrow persists across API route calls in one
// dev server process. (A real deployment uses the on-chain account for state.)
const g = globalThis as unknown as { __rewards?: RewardsClient };
export const rewards: RewardsClient = g.__rewards ?? (g.__rewards = new MockRewardsClient());
