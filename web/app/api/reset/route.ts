import { NextResponse } from "next/server";
import { rewards } from "@/lib/rewards/mockClient";

export async function POST() {
  await rewards.reset();
  return NextResponse.json(await rewards.getState());
}
