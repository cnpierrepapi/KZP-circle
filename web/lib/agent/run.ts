import { RewardsClient } from "@/lib/rewards/types";
import { WORK } from "@/lib/rewards/schedule";
import { findLeads, industries, Lead } from "./leads";
import { draftTemplate, Draft } from "./draft";

export interface RunResult {
  city: string;
  leads: Lead[];
  drafts: Draft[];
  skipped: string[];
  state: Awaited<ReturnType<RewardsClient["getState"]>>;
}

export async function runAgent(client: RewardsClient): Promise<RunResult> {
  const leads = findLeads();
  const inds = industries();
  const skipped: string[] = [];

  // 1. Find leads — one reward unit per 10 fetches.
  const units = Math.max(1, Math.floor(leads.length / 10));
  await settle(client, WORK.FIND_LEADS.id, `Find leads (${leads.length} Warsaw businesses)`, units, skipped);

  // 2. Draft one Sonnet template per industry (parallel).
  const drafts = await Promise.all(inds.map((ind) => draftTemplate(ind, findLeads(ind))));
  for (const d of drafts) {
    await settle(client, WORK.DRAFT.id, `Draft template: ${d.industry}`, 1, skipped);
  }

  // 3. Send a batch of 20 + one follow-up per industry.
  for (const ind of inds) {
    await settle(client, WORK.SEND_BATCH.id, `Send batch + follow-up: ${ind}`, 1, skipped);
  }

  return { city: leads[0]?.city ?? "Warsaw", leads, drafts, skipped, state: await client.getState() };
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
    skipped.push(label);
  }
}
