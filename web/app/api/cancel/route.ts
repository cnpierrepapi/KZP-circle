import { NextResponse } from "next/server";
import { mandate } from "@/lib/mandate/mockClient";

export async function POST() {
  const res = await mandate.cancel();
  return NextResponse.json({ ...res, state: await mandate.getState() });
}
