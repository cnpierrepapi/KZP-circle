import { NextResponse } from "next/server";
import { mandate } from "@/lib/mandate/mockClient";
import { MANDATE } from "@/lib/mandate/schedule";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const amount = typeof body.amount === "number" ? body.amount : MANDATE.fundIncrement;
    return NextResponse.json(await mandate.fund(amount));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
