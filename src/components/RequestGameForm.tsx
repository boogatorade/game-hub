"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function RequestGameForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [idea, setIdea] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idea.trim()) {
      setStatus({ kind: "error", message: "Please describe a game." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const subject = `Game Hub request${name ? ` from ${name}` : ""}`;
      const bodyLines = [
        name ? `Name: ${name}` : null,
        email ? `Email: ${email}` : null,
        "",
        "Idea:",
        idea,
      ].filter((line) => line !== null);
      const body = bodyLines.join("\n");
      const url = `mailto:boogatorade@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = url;
      setStatus({ kind: "success" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not open mail app",
      });
    }
  }

  const sending = status.kind === "sending";
  const inputClass =
    "w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-300/60 focus:outline-none focus:ring-1 focus:ring-cyan-300/40";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-white/10 bg-zinc-950/80 p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            disabled={sending}
            className={`${inputClass} mt-2`}
            placeholder="Your name"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">Email (optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            disabled={sending}
            className={`${inputClass} mt-2`}
            placeholder="you@example.com"
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">Game idea</span>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          required
          maxLength={5000}
          rows={5}
          disabled={sending}
          className={`${inputClass} mt-2 resize-y`}
          placeholder="What game would you like to see? Rules, theme, anything."
        />
      </label>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={sending || !idea.trim()}
          className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-300"
        >
          {sending ? "Sending..." : "Send request"}
        </button>
        {status.kind === "success" && (
          <p className="text-sm text-cyan-300">Opening your email app — hit Send to deliver it.</p>
        )}
        {status.kind === "error" && (
          <p className="text-sm text-red-300">{status.message}</p>
        )}
      </div>
    </form>
  );
}
