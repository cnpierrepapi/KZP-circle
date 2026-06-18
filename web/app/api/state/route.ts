import { NextResponse } from "next/server";
import { mandate } from "@/lib/mandate/mockClient";

export async function GET() {
  return NextResponse.json(await mandate.getState());
}
