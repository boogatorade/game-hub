import type * as Party from "partykit/server";
import { Chess } from "chess.js";

type Conn = Party.Connection<{ player?: number }>;
type Player = { id: string };
type AnyState = Record<string, any> & { game: string; players: Player[]; started: boolean; error?: string };

export default class GameServer implements Party.Server {
  state: AnyState;
  constructor(readonly room: Party.Room) {
    const publicName: Record<string, string> = { connectfour: "connect-four", guesswho: "guess-who" };
    this.state = { game: publicName[room.name] || room.name, players: [], started: false };
  }

  onRequest() {
    return new Response(JSON.stringify({ ok: true, room: this.state.game }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  onConnect(conn: Conn) {
    const slot = this.state.players.findIndex((p) => p.id === conn.id);
    let player = slot;
    if (player < 0 && this.state.players.length < 2) {
      player = this.state.players.length;
      this.state.players.push({ id: conn.id });
      conn.setState({ player });
    }
    if (this.state.players.length === 2 && !this.state.started) this.start();
    this.sendAll();
  }

  onClose(conn: Conn) {
    this.state.players = this.state.players.filter((p) => p.id !== conn.id);
    if (this.state.players.length < 2) this.state.started = false;
    this.sendAll();
  }

  onMessage(raw: string, conn: Conn) {
    const player = this.state.players.findIndex((p) => p.id === conn.id);
    if (player < 0 || player > 1) return;
    const msg = JSON.parse(raw);
    this.state.error = "";
    try {
      if (this.state.game === "chess") chess(this.state, msg, player);
      if (this.state.game === "connect-four") connectFour(this.state, msg, player);
      if (this.state.game === "uno") uno(this.state, msg, player);
      if (this.state.game === "guess-who") guessWho(this.state, msg, player);
      if (this.state.game === "rummikub") rummikub(this.state, msg, player);
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : "Invalid move";
    }
    this.sendAll();
  }

  start() {
    const game = this.state.game;
    if (game === "chess") this.state = { ...this.base(), fen: new Chess().fen(), turn: "white", over: false, winner: null };
    if (game === "connect-four") this.state = { ...this.base(), board: Array.from({ length: 6 }, () => Array(7).fill(0)), turn: 0, winner: null };
    if (game === "uno") this.state = startUno(this.base());
    if (game === "guess-who") this.state = { ...this.base(), secrets: [null, null], flipped: [[], []], turn: 0, log: [] };
    if (game === "rummikub") this.state = startRummikub(this.base());
  }

  base() {
    return { game: this.state.game, players: this.state.players, started: true };
  }

  sendAll() {
    for (const conn of this.room.getConnections() as Iterable<Conn>) {
      const player = this.state.players.findIndex((p) => p.id === conn.id);
      conn.send(JSON.stringify(view(this.state, player)));
    }
  }
}

function view(state: AnyState, player: number) {
  const players = state.players.map((_, i) => `Player ${i + 1}`);
  const base: Record<string, any> = { ...state, players, playerIndex: player };
  delete base.secrets;
  delete base.hands;
  delete base.racks;
  if (state.game === "uno" && player >= 0) return { ...base, hand: state.hands[player], opponentCount: state.hands[1 - player].length };
  if (state.game === "guess-who" && player >= 0) return { ...base, secret: state.secrets[player], flipped: state.flipped[player] };
  if (state.game === "rummikub" && player >= 0) return { ...base, rack: state.racks[player] };
  return base;
}

function assertTurn(state: AnyState, player: number) {
  if (!state.started) throw new Error("Waiting for both players");
  if (state.winner !== null && state.winner !== undefined) throw new Error("Game is over");
  if (state.turn !== player) throw new Error("Not your turn");
}

function chess(state: AnyState, msg: any, player: number) {
  if (msg.type !== "move") return;
  const chessGame = new Chess(state.fen);
  const expected = chessGame.turn() === "w" ? 0 : 1;
  if (player !== expected) throw new Error("Not your turn");
  const move = chessGame.move({ from: msg.from, to: msg.to, promotion: msg.promotion || "q" });
  if (!move) throw new Error("Illegal chess move");
  state.fen = chessGame.fen();
  state.turn = chessGame.turn() === "w" ? "white" : "black";
  state.over = chessGame.isGameOver();
  state.winner = chessGame.isCheckmate() ? (chessGame.turn() === "w" ? "black" : "white") : null;
}

function connectFour(state: AnyState, msg: any, player: number) {
  if (msg.type !== "drop") return;
  assertTurn(state, player);
  const col = Number(msg.col);
  if (!Number.isInteger(col) || col < 0 || col > 6) throw new Error("Invalid column");
  for (let row = 5; row >= 0; row--) {
    if (state.board[row][col] === 0) {
      state.board[row][col] = player + 1;
      if (wins(state.board, row, col, player + 1)) state.winner = player;
      else if (state.board.every((r: number[]) => r.every(Boolean))) state.winner = -1;
      else state.turn = 1 - player;
      return;
    }
  }
  throw new Error("Column is full");
}

function wins(board: number[][], row: number, col: number, mark: number) {
  return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dr, dc]) => {
    let count = 1;
    for (const dir of [-1, 1]) {
      let r = row + dr * dir, c = col + dc * dir;
      while (board[r]?.[c] === mark) { count++; r += dr * dir; c += dc * dir; }
    }
    return count >= 4;
  });
}

const colors = ["red", "yellow", "green", "blue"];
function startUno(base: AnyState) {
  const deck: any[] = [];
  for (const color of colors) {
    for (let n = 0; n <= 9; n++) deck.push({ id: `${color}-${n}-${Math.random()}`, color, value: String(n) });
    for (const value of ["skip", "reverse", "+2"]) deck.push({ id: `${color}-${value}-${Math.random()}`, color, value });
  }
  for (let i = 0; i < 4; i++) deck.push({ id: `wild-${i}`, color: "wild", value: "wild" });
  shuffle(deck);
  const hands = [deck.splice(0, 7), deck.splice(0, 7)];
  let top = deck.shift();
  while (top.color === "wild") { deck.push(top); top = deck.shift(); }
  return { ...base, deck, hands, top, turn: 0, winner: null };
}

function uno(state: AnyState, msg: any, player: number) {
  assertTurn(state, player);
  if (msg.type === "draw") {
    const card = state.deck.shift();
    if (card) state.hands[player].push(card);
    state.turn = 1 - player;
    return;
  }
  if (msg.type !== "play") return;
  const idx = state.hands[player].findIndex((c: any) => c.id === msg.id);
  if (idx < 0) throw new Error("Card not in hand");
  const card = state.hands[player][idx];
  if (card.color !== "wild" && card.color !== state.top.color && card.value !== state.top.value) throw new Error("Card does not match");
  state.hands[player].splice(idx, 1);
  state.top = { ...card, color: card.color === "wild" ? (colors.includes(msg.color) ? msg.color : "red") : card.color };
  if (state.hands[player].length === 0) state.winner = player;
  const skip = ["skip", "reverse", "+2", "wild"].includes(card.value);
  if (card.value === "+2") state.hands[1 - player].push(...state.deck.splice(0, 2));
  state.turn = skip ? player : 1 - player;
}

function guessWho(state: AnyState, msg: any, player: number) {
  if (msg.type === "secret" && state.secrets[player] === null) state.secrets[player] = Number(msg.id);
  if (state.secrets.some((x: number | null) => x === null)) return;
  if (msg.type === "flip") {
    const id = Number(msg.id);
    if (!state.flipped[player].includes(id)) state.flipped[player].push(id);
  }
  if (msg.type === "ask") {
    if (state.turn !== player) throw new Error("Not your turn");
    const question = String(msg.question || "").slice(0, 120);
    if (question) state.log.push(`Player ${player + 1}: ${question}`);
    state.turn = 1 - player;
  }
}

function startRummikub(base: AnyState) {
  const pool: any[] = [];
  for (const color of colors) for (let n = 1; n <= 13; n++) for (let copy = 0; copy < 2; copy++) pool.push({ id: `${color}-${n}-${copy}`, color, n });
  pool.push({ id: "joker-1", color: "joker", n: "J" }, { id: "joker-2", color: "joker", n: "J" });
  shuffle(pool);
  return { ...base, pool, racks: [pool.splice(0, 14), pool.splice(0, 14)], table: [], turn: 0, winner: null };
}

function rummikub(state: AnyState, msg: any, player: number) {
  assertTurn(state, player);
  if (msg.type === "draw") {
    const tile = state.pool.shift();
    if (tile) state.racks[player].push(tile);
    state.turn = 1 - player;
    return;
  }
  if (msg.type === "end") { state.turn = 1 - player; return; }
  if (msg.type !== "place") return;
  const ids = new Set<string>(msg.ids || []);
  const group = state.racks[player].filter((t: any) => ids.has(t.id));
  if (!validGroup(group)) throw new Error("Group must be same-number different-color set of 3-4, or same-color run of 3+");
  state.racks[player] = state.racks[player].filter((t: any) => !ids.has(t.id));
  state.table.push(group);
  if (state.racks[player].length === 0) state.winner = player;
}

function validGroup(group: any[]) {
  if (group.length < 3) return false;
  if (group.some((t) => t.color === "joker")) return true;
  const sameNumber = group.every((t) => t.n === group[0].n) && new Set(group.map((t) => t.color)).size === group.length && group.length <= 4;
  const sorted = [...group].sort((a, b) => a.n - b.n);
  const run = group.every((t) => t.color === group[0].color) && sorted.every((t, i) => i === 0 || t.n === sorted[i - 1].n + 1);
  return sameNumber || run;
}

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
