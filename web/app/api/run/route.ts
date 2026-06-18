import { NextResponse } from "next/server";
import { mandate } from "@/lib/mandate/mockClient";
import { runAgent } from "@/lib/agent/run";

export async function POST() {
  try {
    return NextResponse.json(await runAgent(mandate));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
