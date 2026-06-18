import { MandateClient, MandateState } from "@/lib/mandate/types";
import { WORK } from "@/lib/mandate/schedule";
import { findLeads, industries, Lead } from "./leads";
import { draftTemplate, Draft } from "./draft";

export interface WorkResult {
  label: string;
  amount: number;
  status: "paid" | "RateLimitExceeded" | "InsufficientFunds" | "MandateInactive" | string;
}

export interface RunResult {
  city: string;
  leads: Lead[];
  drafts: Draft[];
  results: WorkResult[];
  state: MandateState;
}

// One agent cycle: it tries to get paid for each unit of work by pulling from the
// mandate. The mandate (not the agent) decides whether the pull is allowed.
export async function runAgent(client: MandateClient): Promise<RunResult> {
  const leads = findLeads();
  const inds = industries();
  const results: WorkResult[] = [];

  await tryPull(client, WORK.FIND_LEADS.amount, `Find leads (${leads.length} Warsaw businesses)`, results);

  const drafts = await Promise.all(inds.map((i) => draftTemplate(i, findLeads(i))));
  for (const d of drafts) {
    await tryPull(client, WORK.DRAFT.amount, `Draft pitch: ${d.industry}`, results);
  }

  for (const ind of inds) {
    await tryPull(client, WORK.SEND_BATCH.amount, `Send batch + follow-up: ${ind}`, results);
  }

  return { city: leads[0]?.city ?? "Warsaw", leads, drafts, results, state: await client.getState() };
}

async function tryPull(client: MandateClient, amount: number, label: string, out: WorkResult[]) {
  try {
    await client.pull(amount, label);
    out.push({ label, amount, status: "paid" });
  } catch (e) {
    out.push({ label, amount, status: (e as Error).message });
  }
}
