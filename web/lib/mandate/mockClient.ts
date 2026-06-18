import { MandateClient, MandateState, Pull } from "./types";
import { MANDATE } from "./schedule";

// In-memory mirror of the on-chain standing_order program:
//   fund   -> add to escrow
//   pull   -> provider takes <= maxPerPeriod per window, <= escrow balance
//   cancel -> refund remainder + deactivate
// The per-period cap is the "cannot overcharge you" guarantee, enforced here exactly
// as the program enforces it.
class MockMandateClient implements MandateClient {
  private active = true;
  private funded = 0;
  private escrow = 0;
  private totalPulled = 0;
  private spent = 0;
  private periodStartMs = Date.now();
  private nextNonce = 1;
  private pulls: Pull[] = [];
  private cfg = MANDATE;

  private rollWindow() {
    if (Date.now() - this.periodStartMs >= this.cfg.periodSecs * 1000) {
      this.periodStartMs = Date.now();
      this.spent = 0;
    }
  }

  private snapshot(): MandateState {
    this.rollWindow();
    const elapsed = (Date.now() - this.periodStartMs) / 1000;
    return {
      active: this.active,
      funded: this.funded,
      escrowBalance: this.escrow,
      providerEarned: this.totalPulled,
      maxPerPeriod: this.cfg.maxPerPeriod,
      spentThisPeriod: this.spent,
      periodSecs: this.cfg.periodSecs,
      secondsUntilReset: Math.max(0, Math.ceil(this.cfg.periodSecs - elapsed)),
      lowBalanceThreshold: this.cfg.lowBalanceThreshold,
      lowBalance: this.active && this.escrow < this.cfg.lowBalanceThreshold,
      pulls: [...this.pulls].reverse(),
    };
  }

  async getState() {
    return this.snapshot();
  }

  async fund(amount: number) {
    if (amount <= 0) throw new Error("InvalidAmount");
    this.funded += amount;
    this.escrow += amount;
    return this.snapshot();
  }

  async pull(amount: number, label: string): Promise<Pull> {
    if (!this.active) throw new Error("MandateInactive");
    if (amount <= 0) throw new Error("InvalidAmount");
    this.rollWindow();
    if (this.spent + amount > this.cfg.maxPerPeriod) throw new Error("RateLimitExceeded");
    if (this.escrow < amount) throw new Error("InsufficientFunds");

    this.escrow -= amount;
    this.spent += amount;
    this.totalPulled += amount;
    const pull: Pull = {
      nonce: this.nextNonce++,
      label,
      amount,
      remaining: this.escrow,
      at: new Date().toISOString(),
    };
    this.pulls.push(pull);
    return pull;
  }

  async cancel() {
    const refunded = this.escrow;
    this.escrow = 0;
    this.active = false;
    return { refunded };
  }

  async reset() {
    this.active = true;
    this.funded = 0;
    this.escrow = 0;
    this.totalPulled = 0;
    this.spent = 0;
    this.periodStartMs = Date.now();
    this.nextNonce = 1;
    this.pulls = [];
  }
}

const g = globalThis as unknown as { __mandate?: MandateClient };
export const mandate: MandateClient = g.__mandate ?? (g.__mandate = new MockMandateClient());
