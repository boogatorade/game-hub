import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: "Stripe checkout is not implemented yet." }, { status: 501 });
}

export function GET() {
  return NextResponse.json({ error: "Stripe checkout is not implemented yet." }, { status: 501 });
}
