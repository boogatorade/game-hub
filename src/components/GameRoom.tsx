"use client";

import dynamic from "next/dynamic";
import PartySocket from "partysocket";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const Chessboard = dynamic(() => import("react-chessboard").then((mod) => mod.Chessboard), { ssr: false });

type Msg = Record<string, unknown>;
type State = {
  game: string;
  players: string[];
  playerIndex?: number;
  started: boolean;
  error?: string;
  [key: string]: unknown;
};

const fallbackHost = typeof window !== "undefined" ? `${window.location.hostname}:1999` : "localhost:1999";
const partyNames: Record<string, string> = { "connect-four": "connectfour", "guess-who": "guesswho" };

export function GameRoom({ gameId, code, title }: { gameId: string; code: string; title: string }) {
  const [state, setState] = useState<State | null>(null);
  const [status, setStatus] = useState("Connecting");
  const searchParams = useSearchParams();
  const vsCpu = searchParams?.get("cpu") === "1";
  const diffParam = searchParams?.get("diff");
  const difficulty: "easy" | "medium" | "hard" =
    diffParam === "easy" || diffParam === "hard" ? diffParam : "medium";
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

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-5 px-5 py-8 lg:grid-cols-[280px_1fr] sm:px-8">
      <aside className="rounded-lg border border-white/10 bg-zinc-950/80 p-5">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">{title}</p>
        <h1 className="mt-2 text-3xl font-bold text-white">{code}</h1>
        <p className="mt-4 text-sm text-zinc-400">Status: {status}</p>
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
      </aside>
      <section className="min-h-[560px] rounded-lg border border-white/10 bg-zinc-950/80 p-4 sm:p-6">
        {!state ? <p className="text-zinc-400">Loading room...</p> : <Renderer state={state} send={send} />}
      </section>
    </main>
  );
}

function Renderer({ state, send }: { state: State; send: (message: Msg) => void }) {
  if (!state.started) return <Waiting />;
  if (state.game === "chess") return <Chess state={state} send={send} />;
  if (state.game === "connect-four") return <ConnectFour state={state} send={send} />;
  if (state.game === "uno") return <Uno state={state} send={send} />;
  if (state.game === "guess-who") return <GuessWho state={state} send={send} />;
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
  return (
    <div className="mx-auto max-w-2xl">
      <Info text={state.winner === null ? `Turn: Player ${Number(state.turn) + 1}` : state.winner === -1 ? "Draw" : `Winner: Player ${Number(state.winner) + 1}`} />
      <div className="grid grid-cols-7 gap-2 rounded-lg bg-blue-800 p-3">
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button key={`${r}-${c}`} onClick={() => send({ type: "drop", col: c })} className="aspect-square rounded-full bg-blue-950 p-1">
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
  return (
    <div className="space-y-6">
      <Info text={`Turn: Player ${Number(state.turn) + 1} - draw pile: ${state.deckCount} - opponent: ${state.opponentCount} cards`} />
      <div className="flex items-center gap-4">
        <CardView card={top} />
        <button onClick={() => send({ type: "draw" })} className="rounded-md bg-white px-4 py-2 font-semibold text-zinc-950">Draw</button>
      </div>
      <div className="flex flex-wrap gap-3">
        {hand.map((card) => <button key={card.id} onClick={() => send({ type: "play", id: card.id, color: card.color === "wild" ? "red" : card.color })}><CardView card={card} /></button>)}
      </div>
      {state.winner !== null && state.winner !== undefined ? <Info text={`Player ${Number(state.winner) + 1} wins`} /> : null}
    </div>
  );
}

type Card = { id: string; color: string; value: string };
const cardColors: Record<string, string> = { red: "bg-red-500", yellow: "bg-yellow-300 text-zinc-950", green: "bg-green-500", blue: "bg-blue-500", wild: "bg-zinc-900" };
function CardView({ card }: { card: Card }) {
  return <div className={`grid h-28 w-20 place-items-center rounded-lg border-2 border-white/80 ${cardColors[card.color]} text-lg font-black shadow-lg`}><span>{card.value}</span></div>;
}

const people = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  skin: ["#f3c7a4", "#c98862", "#7a4a33", "#f0b38b"][i % 4],
  hair: ["#111827", "#7c2d12", "#facc15", "#6b7280"][i % 4],
  glasses: i % 3 === 0,
  hat: i % 5 === 0,
  beard: i % 4 === 0,
}));

function GuessWho({ state, send }: { state: State; send: (message: Msg) => void }) {
  const [question, setQuestion] = useState("");
  const flipped = new Set((state.flipped as number[]) ?? []);
  return (
    <div className="space-y-5">
      <Info text={state.secret === undefined ? "Pick your secret character" : `Your secret is #${Number(state.secret) + 1}. Turn: Player ${Number(state.turn) + 1}`} />
      <form className="flex gap-3" onSubmit={(event) => { event.preventDefault(); send({ type: "ask", question }); setQuestion(""); }}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a yes/no question" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white" />
        <button className="rounded-md bg-white px-4 py-2 font-semibold text-zinc-950">Ask</button>
      </form>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {people.map((person) => (
          <button key={person.id} onClick={() => state.secret === undefined ? send({ type: "secret", id: person.id }) : send({ type: "flip", id: person.id })} className={`rounded-md border border-white/10 p-2 ${flipped.has(person.id) ? "opacity-25" : ""}`}>
            <Avatar person={person} />
            <span className="text-xs text-zinc-400">#{person.id + 1}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2 text-sm text-zinc-300">{((state.log as string[]) ?? []).slice(-6).map((line, i) => <p key={i}>{line}</p>)}</div>
    </div>
  );
}

function Avatar({ person }: { person: (typeof people)[number] }) {
  return (
    <svg viewBox="0 0 80 80" className="mx-auto h-20 w-20 rounded bg-zinc-900">
      {person.hat && <rect x="18" y="8" width="44" height="12" rx="3" fill="#0f766e" />}
      <circle cx="40" cy="42" r="22" fill={person.skin} />
      <path d="M20 34 Q40 10 60 34 V24 Q40 4 20 24Z" fill={person.hair} />
      <circle cx="32" cy="42" r="3" fill="#111827" /><circle cx="48" cy="42" r="3" fill="#111827" />
      {person.glasses && <path d="M24 40h16v9H24zM40 44h4M44 40h16v9H44z" fill="none" stroke="#111827" strokeWidth="2" />}
      {person.beard && <path d="M25 52 Q40 72 55 52 Q50 64 40 66 Q30 64 25 52" fill={person.hair} />}
    </svg>
  );
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
        <button onClick={() => { send({ type: "place", ids: selected }); setSelected([]); }} className="rounded-md border border-white/20 px-4 py-2">Place group</button>
        <button onClick={() => send({ type: "end" })} className="rounded-md border border-white/20 px-4 py-2">End turn</button>
      </div>
      <div className="rounded-lg bg-black/20 p-3">
        <p className="mb-3 text-sm text-zinc-400">Table</p>
        <div className="space-y-3">{((state.table as Tile[][]) ?? []).map((group, i) => <div key={i} className="flex flex-wrap gap-2">{group.map((tile) => <TileView key={tile.id} tile={tile} />)}</div>)}</div>
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
