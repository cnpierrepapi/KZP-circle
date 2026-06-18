import { RewardsClient } from "@/lib/rewards/types";
import { WORK } from "@/lib/rewards/schedule";
import { findLeads, industries } from "./leads";
import { draftTemplate, Draft } from "./draft";

// Orchestrates one full agent run and settles each unit of work through the
// rewards client (which, in mock mode, plays the role of program + oracle).
export interface RunResult {
  drafts: Draft[];
  skipped: string[]; // work that could not be paid (vault ran dry)
  state: Awaited<ReturnType<RewardsClient["getState"]>>;
}

export async function runAgent(client: RewardsClient): Promise<RunResult> {
  const leads = findLeads();
  const inds = industries();
  const skipped: string[] = [];

  // 1. Find leads — one reward unit per 10 fetches.
  const units = Math.max(1, Math.floor(leads.length / 10));
  await settle(client, WORK.FIND_LEADS.id, `Find leads (${leads.length} fetched)`, units, skipped);

  // 2. Draft one template per industry.
  const drafts: Draft[] = [];
  for (const ind of inds) {
    const d = draftTemplate(ind);
    drafts.push(d);
    await settle(client, WORK.DRAFT.id, `Draft template: ${ind}`, 1, skipped);
  }

  // 3. Send a batch of 20 + one follow-up per industry.
  for (const ind of inds) {
    await settle(client, WORK.SEND_BATCH.id, `Send batch + follow-up: ${ind}`, 1, skipped);
  }

  return { drafts, skipped, state: await client.getState() };
}

async function settle(
  client: RewardsClient,
  workType: number,
  label: string,
  qty: number,
  skipped: string[]
) {
  try {
    await client.claim(workType, label, qty);
  } catch {
    skipped.push(label); // vault could not cover it — surfaced in the UI
  }
}
