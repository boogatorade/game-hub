"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ActiveRoom = {
  game: string;
  code: string;
  players: number;
  started: boolean;
  lastSeen: number;
};

type LobbyResponse = { rooms?: ActiveRoom[] };

const fallbackHost = typeof window !== "undefined" ? `${window.location.hostname}:1999` : "localhost:1999";

function lobbyUrl(gameId: string) {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || fallbackHost;
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}/parties/lobby/default?game=${encodeURIComponent(gameId)}`;
}

export function ActiveRooms({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(lobbyUrl(gameId), { cache: "no-store" });
        if (!response.ok) throw new Error("Lobby unavailable");
        const data = (await response.json()) as LobbyResponse;
        if (!active) return;
        setRooms((data.rooms || []).filter((room) => room.players > 0));
        setFailed(false);
      } catch {
        if (!active) return;
        setRooms([]);
        setFailed(true);
      }
    }
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [gameId]);

  return (
    <section className="mt-8 rounded-lg border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Currently active rooms</h2>
        {failed ? <span className="text-xs text-zinc-500">Lobby unavailable</span> : null}
      </div>
      {rooms.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">No active rooms - create one!</p>
      ) : (
        <div className="mt-4 divide-y divide-white/10 rounded-md border border-white/10">
          {rooms.map((room) => (
            <div key={`${room.game}:${room.code}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm">
              <span className="font-mono text-white">{room.code.toUpperCase()}</span>
              <span className="text-zinc-300">{Math.min(room.players, 2)}/2</span>
              <button
                type="button"
                onClick={() => router.push(`/games/${gameId}/${room.code.toUpperCase()}`)}
                className="rounded-md border border-cyan-300/40 px-3 py-1.5 font-semibold text-cyan-200 hover:bg-cyan-300/10"
              >
                Join
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
