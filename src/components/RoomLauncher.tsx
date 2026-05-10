"use client";

import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Difficulty = "easy" | "medium" | "hard";

const difficultyOptions: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Plays casually. Mostly random moves." },
  { id: "medium", label: "Medium", blurb: "Looks one move ahead. Wins, blocks, plays solidly." },
  { id: "hard", label: "Hard", blurb: "Searches deeper. Will punish mistakes." },
];

export function RoomLauncher({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  function createRoom() {
    router.push(`/games/${gameId}/${nanoid(6).toUpperCase()}`);
  }

  function createCpuRoom() {
    router.push(`/games/${gameId}/${nanoid(6).toUpperCase()}?cpu=1&diff=${difficulty}`);
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(clean)) router.push(`/games/${gameId}/${clean}`);
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <button onClick={createRoom} className="rounded-md bg-cyan-300 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-200">
          Create Room
        </button>
        <form onSubmit={joinRoom} className="flex gap-3">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={6}
            placeholder="Join with code"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-4 py-3 uppercase text-white outline-none focus:border-cyan-300"
          />
          <button className="rounded-md border border-white/15 px-5 py-3 font-semibold text-white hover:border-white/35">Join</button>
        </form>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-5">
        <p className="text-sm uppercase tracking-[0.2em] text-fuchsia-300">Play vs CPU</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {difficultyOptions.map((option) => {
            const active = difficulty === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setDifficulty(option.id)}
                aria-pressed={active}
                className={`rounded-md border px-4 py-3 text-left transition ${
                  active
                    ? "border-fuchsia-300 bg-fuchsia-400/15 text-white"
                    : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/30"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-zinc-400">{option.blurb}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={createCpuRoom}
          className="mt-4 rounded-md bg-fuchsia-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-fuchsia-300"
        >
          Start {difficultyOptions.find((d) => d.id === difficulty)?.label} CPU game
        </button>
      </div>
    </div>
  );
}
