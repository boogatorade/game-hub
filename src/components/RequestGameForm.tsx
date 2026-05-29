"use client";

import { useState } from "react";
import type { FormEvent } from "react";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idea.trim()) {
      setStatus({ kind: "error", message: "Please describe a game." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const response = await fetch("/api/game-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, idea }),
      });
      if (!response.ok) {
        if (response.status === 503) {
          throw new Error("Email isn't configured yet - bug Asher to add the GMAIL_* env vars in Vercel.");
        }
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Could not send request");
      }
      setStatus({ kind: "success" });
      setIdea("");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not send request",
      });
    }
  }

  const sending = status.kind === "sending";
  return (
    <form onSubmit={handleSubmit} className="request-form">
      <div className="request-grid">
        <label>
          <span>Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            disabled={sending}
            placeholder="Your name"
          />
        </label>
        <label>
          <span>Email (optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            disabled={sending}
            placeholder="you@example.com"
          />
        </label>
      </div>
      <label>
        <span>Game idea</span>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          required
          maxLength={5000}
          rows={5}
          disabled={sending}
          placeholder="What game would you like to see? Rules, theme, anything."
        />
      </label>
      <div className="request-actions">
        <button
          type="submit"
          disabled={sending || !idea.trim()}
          className="primary-btn"
        >
          {sending ? "Sending..." : "Send request"}
        </button>
        {status.kind === "success" && (
          <p className="form-status success">Thanks - your request is on its way.</p>
        )}
        {status.kind === "error" && (
          <p className="form-status error">{status.message}</p>
        )}
      </div>
    </form>
  );
}
