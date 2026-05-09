import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const TO = "boogatorade@gmail.com";

export async function POST(req: Request) {
  let body: { name?: unknown; email?: unknown; idea?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 320) : "";
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";

  if (!idea) {
    return NextResponse.json({ error: "Game idea is required" }, { status: 400 });
  }
  if (idea.length > 5000) {
    return NextResponse.json({ error: "Game idea is too long (max 5000 chars)" }, { status: 400 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const subject = `Game Hub request: ${idea.slice(0, 60)}${idea.length > 60 ? "..." : ""}`;
    const text = [
      `Name:  ${name || "(not provided)"}`,
      `Email: ${email || "(not provided)"}`,
      "",
      "Idea:",
      idea,
    ].join("\n");

    await transporter.sendMail({
      from: user,
      to: TO,
      replyTo: email || undefined,
      subject,
      text,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("game-request mail error", err);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
