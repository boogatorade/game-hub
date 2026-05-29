"use client";

import { customAlphabet } from "nanoid";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import type { games } from "@/lib/games";

// Alphanumeric only, no look-alike chars (no 0/O, no 1/I/L). Easy to share verbally.
const makeRoomCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

type Difficulty = "easy" | "medium" | "hard" | "expert";
type Game = (typeof games)[number];
type Tab = "create" | "join" | "cpu";

const difficultyOptions: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Plays casually. Mostly random moves." },
  { id: "medium", label: "Medium", blurb: "Looks one move ahead. Wins, blocks, plays solidly." },
  { id: "hard", label: "Hard", blurb: "Searches deeper. Will punish mistakes." },
  { id: "expert", label: "Expert", blurb: "Deeper search, punishes inaccuracies." },
];

export function RoomLauncher({
  game,
  trigger,
  initialCode = "",
}: {
  game: Game;
  trigger?: (open: () => void) => ReactNode;
  initialCode?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(initialCode ? "join" : "create");
  const [code, setCode] = useState(initialCode);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const visibleDifficulties = difficultyOptions.filter((option) => option.id !== "expert" || game.id === "chess");

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openLauncher(nextTab: Tab = initialCode ? "join" : "create") {
    setTab(nextTab);
    setOpen(true);
  }

  function createRoom() {
    router.push(`/games/${game.id}/${makeRoomCode()}`);
  }

  function createCpuRoom() {
    router.push(`/games/${game.id}/${makeRoomCode()}?cpu=1&diff=${difficulty}`);
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(clean)) router.push(`/games/${game.id}/${clean}`);
  }

  const cleanCode = code.trim().toUpperCase();
  const canJoin = /^[A-Z0-9]{6}$/.test(cleanCode);

  return (
    <>
      {trigger ? trigger(() => openLauncher()) : (
        <div className="launcher-inline" style={{ "--tint": game.accent } as CSSProperties}>
          <button type="button" className="primary-btn compact" onClick={() => openLauncher("create")}>Create room →</button>
          <button type="button" className="secondary-btn" onClick={() => openLauncher("join")}>Join with code</button>
          <button type="button" className="secondary-btn" onClick={() => openLauncher("cpu")}>Play vs CPU</button>
        </div>
      )}

      <div
        className={`scrim${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${game.id}-modal-title`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="modal" style={{ "--tint": game.accent } as CSSProperties}>
          <div className="modal-head">
            <span className="modal-game-name">{game.name}</span>
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          <h3 className="modal-title" id={`${game.id}-modal-title`}>Play {game.name}</h3>
          <p className="modal-sub">{game.launcherSub}</p>

          <div className="tabs" role="tablist" aria-label={`${game.name} room options`}>
            <button type="button" className={`tab${tab === "create" ? " active" : ""}`} role="tab" aria-selected={tab === "create"} onClick={() => setTab("create")}>Create room</button>
            <button type="button" className={`tab${tab === "join" ? " active" : ""}`} role="tab" aria-selected={tab === "join"} onClick={() => setTab("join")}>Join with code</button>
            <button type="button" className={`tab${tab === "cpu" ? " active" : ""}`} role="tab" aria-selected={tab === "cpu"} onClick={() => setTab("cpu")}>Play vs CPU</button>
          </div>

          <div className={`panel${tab === "create" ? " show" : ""}`}>
            <div className="field">
              <label htmlFor={`${game.id}-name`}>Your display name</label>
              <input type="text" id={`${game.id}-name`} placeholder="e.g. froggy_22" maxLength={20} />
            </div>
            <div className="field">
              <label>Room visibility</label>
              <div className="toggles" aria-label="Room visibility">
                <button type="button" className="toggle active">Private</button>
                <button type="button" className="toggle">Friends only</button>
                <button type="button" className="toggle">Public</button>
              </div>
            </div>
            <button type="button" className="primary-btn" onClick={createRoom}>Create room →</button>
            <p className="hint">Generates a six-character code. Share it with a friend.</p>
          </div>

          <form className={`panel${tab === "join" ? " show" : ""}`} onSubmit={joinRoom}>
            <div className="field">
              <label htmlFor={`${game.id}-code`}>Room code</label>
              <input
                type="text"
                className="code"
                id={`${game.id}-code`}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor={`${game.id}-join-name`}>Your display name</label>
              <input type="text" id={`${game.id}-join-name`} placeholder="e.g. froggy_22" maxLength={20} />
            </div>
            <button type="submit" className="primary-btn" disabled={!canJoin}>Join room →</button>
            <p className="hint">No account needed. Press Enter to join.</p>
          </form>

          <div className={`panel${tab === "cpu" ? " show" : ""}`}>
            <div className="field">
              <label>Difficulty</label>
              <div className="difficulty-grid">
                {visibleDifficulties.map((option) => {
                  const active = difficulty === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDifficulty(option.id)}
                      aria-pressed={active}
                      className={`difficulty${active ? " active" : ""}`}
                    >
                      <span>{option.label}</span>
                      <small>{option.blurb}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <button type="button" className="primary-btn" onClick={createCpuRoom}>
              Start {difficultyOptions.find((d) => d.id === difficulty)?.label} CPU game →
            </button>
            <p className="hint">CPU rooms still use the same server-authoritative game flow.</p>
          </div>
        </div>
      </div>
    </>
  );
}
