import type * as Party from "partykit/server";

type RoomRecord = {
  game: string;
  code: string;
  players: number;
  started: boolean;
  lastSeen: number;
};

type LobbyMessage =
  | { kind: "upsert"; game: string; code: string; players: number; started?: boolean }
  | { kind: "remove"; game: string; code: string };

const rooms = new Map<string, RoomRecord>();
const TTL_MS = 60_000;

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "content-type": "application/json",
};

function key(game: string, code: string) {
  return `${game}:${code.toLowerCase()}`;
}

function prune() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, room] of rooms) {
    if (room.lastSeen < cutoff || room.players <= 0) rooms.delete(id);
  }
}

function list(game: string | null) {
  prune();
  return [...rooms.values()]
    .filter((room) => room.players > 0 && (!game || room.game === game))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

function applyMessage(message: LobbyMessage) {
  if (message.kind === "remove") {
    rooms.delete(key(message.game, message.code));
    return;
  }
  if (!message.game || !message.code || message.players <= 0) return;
  rooms.set(key(message.game, message.code), {
    game: message.game,
    code: message.code.toLowerCase(),
    players: Math.min(2, Math.max(0, Math.floor(message.players))),
    started: !!message.started,
    lastSeen: Date.now(),
  });
}

export default class LobbyServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method === "POST") {
      try {
        const message = (await req.json()) as LobbyMessage;
        applyMessage(message);
        this.sendList();
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers });
      }
    }
    const url = new URL(req.url);
    return new Response(JSON.stringify({ rooms: list(url.searchParams.get("game")) }), { status: 200, headers });
  }

  onMessage(raw: string, conn: Party.Connection) {
    try {
      const message = JSON.parse(raw) as { type?: string; game?: string };
      if (message.type === "subscribe") {
        conn.send(JSON.stringify({ rooms: list(message.game || null) }));
      }
    } catch {
      conn.send(JSON.stringify({ rooms: list(null) }));
    }
  }

  sendList() {
    for (const conn of this.room.getConnections()) {
      conn.send(JSON.stringify({ rooms: list(null) }));
    }
  }
}
