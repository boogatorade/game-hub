"use client";

import dynamic from "next/dynamic";
import PartySocket from "partysocket";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isMuted, play, setMuted as persistMuted } from "@/lib/sounds";

const Chessboard = dynamic(() => import("react-chessboard").then((mod) => mod.Chessboard), { ssr: false });

type Msg = Record<string, unknown>;
type State = {
  game: string;
  players: string[];
  playerIndex?: number;
  started: boolean;
  error?: string;
  chat?: ChatState;
  [key: string]: unknown;
};
type ChatState = {
  status: "idle" | "pending" | "active";
  requestedBy: number | null;
  messages: { from: number; text: string; ts: number }[];
};

const fallbackHost = typeof window !== "undefined" ? `${window.location.hostname}:1999` : "localhost:1999";
const partyNames: Record<string, string> = { "connect-four": "connectfour" };

export function GameRoom({ gameId, code, title }: { gameId: string; code: string; title: string }) {
  const [state, setState] = useState<State | null>(null);
  const [status, setStatus] = useState("Connecting");
  const [muted, setMuted] = useState(() => isMuted());
  const endSoundKey = useRef("");
  const searchParams = useSearchParams();
  const vsCpu = searchParams?.get("cpu") === "1";
  const diffParam = searchParams?.get("diff");
  const difficulty: "easy" | "medium" | "hard" | "expert" =
    diffParam === "easy" || diffParam === "hard" || diffParam === "expert" ? diffParam : "medium";
  const socket = useMemo(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST || fallbackHost;
    return new PartySocket({ host, party: partyNames[gameId] || gameId, room: code.toLowerCase() });
  }, [code, gameId]);

  useEffect(() => {
    socket.addEventListener("open", () => {
      setStatus("Connected");
      if (vsCpu) socket.send(JSON.stringify({ type: "init", vsCpu: true, difficulty }));
    });
    socket.addEventListener("close", () => setStatus("Disconnected"));
    socket.addEventListener("message", (event) => setState(JSON.parse(event.data)));
    return () => socket.close();
  }, [socket, vsCpu, difficulty]);

  function send(message: Msg) {
    socket.send(JSON.stringify(message));
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    persistMuted(next);
  }

  useEffect(() => {
    if (!state) return;
    const winner = winnerIndex(state);
    const key = `${state.game}:${winner ?? "none"}:${state.over ? "over" : ""}`;
    if (winner === null || key === endSoundKey.current) return;
    endSoundKey.current = key;
    play(winner === state.playerIndex ? "win" : "lose");
  }, [state]);

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-5 px-5 py-8 lg:grid-cols-[280px_1fr] sm:px-8">
      <aside className="rounded-lg border border-white/10 bg-zinc-950/80 p-5">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">{title}</p>
        <h1 className="mt-2 text-3xl font-bold text-white">{code}</h1>
        <p className="mt-4 text-sm text-zinc-400">Status: {status}</p>
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          className="mt-4 rounded-md border border-white/15 px-3 py-2 text-lg hover:border-cyan-300/50"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="mt-5 space-y-2 text-sm text-zinc-300">
          <p>Players: {state?.players?.length ?? 0}/2</p>
          {(state?.players ?? []).map((id, index) => {
            const isBot = (state?.bots as boolean[] | undefined)?.[index];
            const label = isBot ? "CPU" : `Player ${index + 1}`;
            return (
              <p key={`${id}-${index}`} className="rounded-md bg-white/5 px-3 py-2">{label}{state?.playerIndex === index ? " (you)" : ""}</p>
            );
          })}
        </div>
        {!state?.started && !vsCpu && <p className="mt-5 text-sm leading-6 text-zinc-400">Share this code with one more player. The game starts automatically.</p>}
        {vsCpu && <p className="mt-5 text-sm leading-6 text-zinc-400">CPU difficulty: <span className="font-semibold text-fuchsia-300 capitalize">{difficulty}</span></p>}
        {!state?.started && vsCpu && <p className="mt-2 text-sm leading-6 text-zinc-400">Spinning up CPU opponent...</p>}
        {state?.error && <p className="mt-5 rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p>}
        {state ? <ChatPanel state={state} send={send} /> : null}
      </aside>
      <section className="min-h-[560px] rounded-lg border border-white/10 bg-zinc-950/80 p-4 sm:p-6">
        {!state ? <p className="text-zinc-400">Loading room...</p> : <Renderer state={state} send={send} />}
      </section>
    </main>
  );
}

function winnerIndex(state: State): number | null {
  if (typeof state.winner === "number" && state.winner >= 0) return state.winner;
  if (state.game === "chess" && typeof state.winner === "string") return state.winner === "white" ? 0 : 1;
  return null;
}

function Renderer({ state, send }: { state: State; send: (message: Msg) => void }) {
  if (!state.started) return <Waiting />;
  if (state.game === "chess") return <Chess state={state} send={send} />;
  if (state.game === "connect-four") return <ConnectFour state={state} send={send} />;
  if (state.game === "uno") return <Uno state={state} send={send} />;
  return <Rummikub state={state} send={send} />;
}

function Waiting() {
  return <div className="grid h-full place-items-center text-zinc-400">Waiting for a second player...</div>;
}

function Chess({ state, send }: { state: State; send: (message: Msg) => void }) {
  return (
    <div className="mx-auto max-w-[560px]">
      <Info text={`You are ${state.playerIndex === 0 ? "white" : "black"} - turn: ${state.turn}`} />
      <Chessboard
        options={{
          position: state.fen as string,
          boardOrientation: state.playerIndex === 1 ? "black" : "white",
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            play("flip");
            send({ type: "move", from: sourceSquare, to: targetSquare, promotion: "q" });
            return true;
          },
        }}
      />
      {state.over ? <Info text={`Game over${state.winner ? `: ${state.winner}` : ""}`} /> : null}
    </div>
  );
}

function ConnectFour({ state, send }: { state: State; send: (message: Msg) => void }) {
  const board = state.board as number[][];
  const previous = useRef("");
  useEffect(() => {
    const current = JSON.stringify(board);
    if (!previous.current) {
      previous.current = current;
      return;
    }
    if (previous.current !== current) {
      const oldBoard = JSON.parse(previous.current) as number[][];
      const changed = board.flatMap((row, r) => row.map((cell, c) => ({ cell, old: oldBoard[r]?.[c] ?? cell }))).find((x) => x.cell !== x.old);
      if (changed && changed.cell !== Number(state.playerIndex) + 1) play("drop");
      previous.current = current;
    }
  }, [board, state.playerIndex]);
  return (
    <div className="mx-auto max-w-2xl">
      <Info text={state.winner === null ? `Turn: Player ${Number(state.turn) + 1}` : state.winner === -1 ? "Draw" : `Winner: Player ${Number(state.winner) + 1}`} />
      <div className="grid grid-cols-7 gap-2 rounded-lg bg-blue-800 p-3">
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button key={`${r}-${c}`} onClick={() => { play("drop"); send({ type: "drop", col: c }); }} className="aspect-square rounded-full bg-blue-950 p-1">
              <span className={`block h-full rounded-full ${cell === 0 ? "bg-zinc-900" : cell === 1 ? "bg-red-400" : "bg-yellow-300"}`} />
            </button>
          )),
        )}
      </div>
    </div>
  );
}

function Uno({ state, send }: { state: State; send: (message: Msg) => void }) {
  const hand = state.hand as Card[];
  const top = state.top as Card;
  const [wild, setWild] = useState<Card | null>(null);
  const previousTurn = useRef<unknown>(state.turn);
  useEffect(() => {
    if (previousTurn.current !== state.turn && state.turn === state.playerIndex) play("notify");
    previousTurn.current = state.turn;
  }, [state.turn, state.playerIndex]);
  function playCard(card: Card, color?: string) {
    play("flip");
    send({ type: "play", id: card.id, color: color || card.color });
    setWild(null);
  }
  return (
    <div className="space-y-6">
      <Info text={`Turn: Player ${Number(state.turn) + 1} - draw pile: ${state.deckCount} - opponent: ${state.opponentCount} cards`} />
      <div className="flex items-center gap-4">
        <CardView card={top} />
        <button onClick={() => send({ type: "draw" })} className="rounded-md bg-white px-4 py-2 font-semibold text-zinc-950">Draw</button>
      </div>
      <div className="flex flex-wrap gap-3">
        {hand.map((card) => (
          <div key={card.id} className="relative">
            <button onClick={() => card.color === "wild" ? setWild(card) : playCard(card)}><CardView card={card} /></button>
            {wild?.id === card.id ? (
              <div className="absolute left-1/2 top-full z-10 mt-2 grid -translate-x-1/2 grid-cols-2 gap-1 rounded-md border border-white/15 bg-zinc-950 p-2 shadow-xl">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Choose ${color}`}
                    onClick={() => playCard(card, color)}
                    className={`h-8 w-8 rounded border border-white/40 ${cardColors[color]}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {state.winner !== null && state.winner !== undefined ? <Info text={`Player ${Number(state.winner) + 1} wins`} /> : null}
    </div>
  );
}

type Card = { id: string; color: string; value: string };
const colors = ["red", "yellow", "green", "blue"];
const cardColors: Record<string, string> = { red: "bg-red-500", yellow: "bg-yellow-300 text-zinc-950", green: "bg-green-500", blue: "bg-blue-500", wild: "bg-zinc-900" };
function CardView({ card }: { card: Card }) {
  return <div className={`grid h-28 w-20 place-items-center rounded-lg border-2 border-white/80 ${cardColors[card.color]} text-lg font-black shadow-lg`}><span>{card.value}</span></div>;
}

function Rummikub({ state, send }: { state: State; send: (message: Msg) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const rack = state.rack as Tile[];
  function toggle(id: string) {
    setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }
  return (
    <div className="space-y-6">
      <Info text={`Turn: Player ${Number(state.turn) + 1} - pool: ${state.poolCount}`} />
      <div className="flex gap-3">
        <button onClick={() => send({ type: "draw" })} className="rounded-md bg-white px-4 py-2 font-semibold text-zinc-950">Draw</button>
        <button onClick={() => { play("place"); send({ type: "place", ids: selected }); setSelected([]); }} className="rounded-md border border-white/20 px-4 py-2">Place group</button>
        <button onClick={() => send({ type: "end" })} className="rounded-md border border-white/20 px-4 py-2">End turn</button>
      </div>
      <div className="rounded-lg bg-black/20 p-3">
        <p className="mb-3 text-sm text-zinc-400">Table</p>
        <div className="space-y-3">
          {((state.table as Tile[][]) ?? []).map((group, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {group.map((tile) => <TileView key={tile.id} tile={tile} />)}
              <button
                type="button"
                onClick={() => { play("place"); send({ type: "place", into: i, ids: selected }); setSelected([]); }}
                className="rounded-md border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:border-cyan-300/50"
              >
                Add selected
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{rack.map((tile) => <button key={tile.id} onClick={() => toggle(tile.id)} className={selected.includes(tile.id) ? "ring-2 ring-cyan-300" : ""}><TileView tile={tile} /></button>)}</div>
    </div>
  );
}

type Tile = { id: string; color: string; n: number | "J" };
const tileColors: Record<string, string> = { red: "text-red-300", blue: "text-blue-300", green: "text-green-300", yellow: "text-yellow-200", joker: "text-fuchsia-300" };
function TileView({ tile }: { tile: Tile }) {
  return <div className={`grid h-16 w-11 place-items-center rounded border border-white/20 bg-zinc-100 text-xl font-black ${tileColors[tile.color]}`}>{tile.n}</div>;
}

function Info({ text }: { text: string }) {
  return <p className="mb-4 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200">{text}</p>;
}

function ChatPanel({ state, send }: { state: State; send: (message: Msg) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const chat = state.chat;
  const player = state.playerIndex ?? -1;
  const opponentRequested = chat?.status === "pending" && chat.requestedBy !== player;
  const visible = !!chat && !state.vsCpu && player >= 0;

  useEffect(() => {
    if (opponentRequested) setOpen(true);
  }, [opponentRequested]);

  if (!visible || !chat) return null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    send({ type: "chat-send", text: clean });
    setText("");
  }

  return (
    <section className="mt-5 rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-white"
      >
        <span>Chat</span>
        <span className="text-cyan-300">{open ? "Hide" : "Open"}</span>
      </button>
      {open ? (
        <div className="border-t border-white/10 p-3 text-sm">
          {chat.status === "idle" ? (
            <button type="button" onClick={() => send({ type: "chat-request" })} className="w-full rounded-md bg-cyan-300 px-3 py-2 font-semibold text-zinc-950 hover:bg-cyan-200">
              Request chat
            </button>
          ) : null}
          {chat.status === "pending" && chat.requestedBy === player ? <p className="text-zinc-400">Waiting for opponent...</p> : null}
          {opponentRequested ? (
            <div className="space-y-3">
              <p className="text-zinc-200">Player {Number(chat.requestedBy) + 1} wants to chat.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => send({ type: "chat-accept" })} className="rounded-md bg-cyan-300 px-3 py-2 font-semibold text-zinc-950">Accept</button>
                <button type="button" onClick={() => send({ type: "chat-decline" })} className="rounded-md border border-white/15 px-3 py-2 text-zinc-200">Decline</button>
              </div>
            </div>
          ) : null}
          {chat.status === "active" ? (
            <div className="space-y-3">
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {chat.messages.length === 0 ? <p className="text-zinc-500">No messages yet.</p> : null}
                {chat.messages.map((message, index) => (
                  <p key={`${message.ts}-${index}`} className={`rounded-md px-3 py-2 ${message.from === player ? "bg-cyan-300/10 text-cyan-100" : "bg-white/5 text-zinc-200"}`}>
                    <span className="block text-xs text-zinc-500">Player {message.from + 1}</span>
                    {message.text}
                  </p>
                ))}
              </div>
              <form onSubmit={submit} className="flex gap-2">
                <input value={text} onChange={(event) => setText(event.target.value)} maxLength={500} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-cyan-300" />
                <button className="rounded-md bg-cyan-300 px-3 py-2 font-semibold text-zinc-950">Send</button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
