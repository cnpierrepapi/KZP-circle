import { NextResponse } from "next/server";
import { rewards } from "@/lib/rewards/mockClient";
import { runAgent } from "@/lib/agent/run";

export async function POST() {
  try {
    const result = await runAgent(rewards);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
