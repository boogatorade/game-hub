"use client";

import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function RoomLauncher({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");

  function createRoom() {
    router.push(`/games/${gameId}/${nanoid(6).toUpperCase()}`);
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(clean)) router.push(`/games/${gameId}/${clean}`);
  }

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-[auto_1fr]">
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
  );
}
