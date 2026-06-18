import { NextResponse } from "next/server";
import { rewards } from "@/lib/rewards/mockClient";

export async function GET() {
  return NextResponse.json(await rewards.getState());
}
