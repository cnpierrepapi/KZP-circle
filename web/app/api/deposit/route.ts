import { NextResponse } from "next/server";
import { rewards } from "@/lib/rewards/mockClient";

export async function POST(req: Request) {
  try {
    const { amount } = (await req.json()) as { amount: number };
    const state = await rewards.deposit(amount);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
