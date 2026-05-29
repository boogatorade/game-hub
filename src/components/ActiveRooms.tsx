"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { games } from "@/lib/games";

type ActiveRoom = {
  game: string;
  code: string;
  players: number;
  started: boolean;
  lastSeen: number;
};

type LobbyResponse = { rooms?: ActiveRoom[] };

const fallbackHost = typeof window !== "undefined" ? `${window.location.hostname}:1999` : "localhost:1999";

function lobbyUrl(gameId?: string) {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || fallbackHost;
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const query = gameId ? `?game=${encodeURIComponent(gameId)}` : "";
  return `${protocol}://${host}/parties/lobby/default${query}`;
}

export function ActiveRooms({ gameId }: { gameId?: string }) {
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
    <section className="rooms-shell">
      <div className="rooms-status">
        {failed ? <span>Lobby unavailable</span> : <span>{gameId ? "Currently active rooms" : "Live PartyKit rooms"}</span>}
      </div>
      {rooms.length === 0 ? (
        <p className="empty-rooms">No active rooms - create one.</p>
      ) : (
        <div className="rooms">
          {rooms.map((room) => {
            const game = gameMeta(room.game);
            const code = room.code.toUpperCase();
            return (
              <button
                key={`${room.game}:${room.code}`}
                type="button"
                className="room"
                style={{ "--tint": game.accent } as CSSProperties}
                onClick={() => router.push(`/games/${room.game}/${code}`)}
              >
                <span className="room-l">
                  <span className="game-name"><span className="dot" />{game.name}</span>
                  <span className="ppl">{Math.min(room.players, 2)}/2 players · {room.started ? "in progress" : "waiting"}</span>
                </span>
                <span className="code">{code}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function gameMeta(gameId: string) {
  return games.find((game) => game.id === gameId) || { name: gameId, accent: "#d8ff5b" };
}
