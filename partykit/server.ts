import type * as Party from "partykit/server";
import { Chess } from "chess.js";

type Conn = Party.Connection<{ player?: number }>;
type Player = { id: string; bot?: boolean };
type AnyState = Record<string, any> & { game: string; players: Player[]; started: boolean; error?: string; vsCpu?: boolean };

const BOT_ID = "__cpu_bot__";

export default class GameServer implements Party.Server {
  state: AnyState;
  botScheduled = false;
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
      // If a bot already occupies a slot, never bump it; new joiners go elsewhere.
      // (CPU rooms only allow 1 human; second human would just spectate via no slot.)
      const botSlots = this.state.players.filter((p) => p.bot).length;
      if (this.state.vsCpu && this.state.players.length - botSlots >= 1) {
        // No room for another human in a CPU game.
      } else {
        this.state.players.push({ id: conn.id });
        conn.setState({ player });
      }
    }
    if (this.state.players.length === 2 && !this.state.started) this.start();
    this.sendAll();
    this.maybeBotMove();
  }

  onClose(conn: Conn) {
    this.state.players = this.state.players.filter((p) => p.id !== conn.id);
    if (this.state.players.length < 2) this.state.started = false;
    this.sendAll();
  }

  onMessage(raw: string, conn: Conn) {
    const player = this.state.players.findIndex((p) => p.id === conn.id);
    const msg = JSON.parse(raw);

    // Init: enable CPU mode if no game has started and no bot yet.
    if (msg && msg.type === "init" && msg.vsCpu && !this.state.started && !this.state.vsCpu) {
      this.state.vsCpu = true;
      // Ensure this human is player 0; add bot as player 1.
      if (this.state.players.length === 0) this.state.players.push({ id: conn.id });
      if (this.state.players.length < 2) this.state.players.push({ id: BOT_ID, bot: true });
      if (this.state.players.length === 2 && !this.state.started) this.start();
      this.sendAll();
      this.maybeBotMove();
      return;
    }

    if (player < 0 || player > 1) return;
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
    this.maybeBotMove();
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
    return { game: this.state.game, players: this.state.players, started: true, vsCpu: this.state.vsCpu };
  }

  sendAll() {
    for (const conn of this.room.getConnections() as Iterable<Conn>) {
      const player = this.state.players.findIndex((p) => p.id === conn.id);
      conn.send(JSON.stringify(view(this.state, player)));
    }
  }

  // ===== Bot driver =====
  botIndex(): number {
    return this.state.players.findIndex((p) => p.bot);
  }

  isBotTurn(): boolean {
    const bot = this.botIndex();
    if (bot < 0 || !this.state.started) return false;
    if (this.state.over) return false;
    const winner = this.state.winner;
    const hasWinner = winner !== null && winner !== undefined;
    if (hasWinner) return false;
    const game = this.state.game;
    if (game === "chess") {
      // turn is "white"/"black"; bot is always player 1 = black in CPU mode.
      return this.state.turn === (bot === 0 ? "white" : "black");
    }
    if (game === "guess-who") {
      // bot also needs to set its secret first
      if (this.state.secrets && this.state.secrets[bot] === null) return true;
      return this.state.turn === bot;
    }
    return this.state.turn === bot;
  }

  maybeBotMove() {
    if (this.botScheduled) return;
    if (!this.isBotTurn()) return;
    this.botScheduled = true;
    const delay = 300 + Math.floor(Math.random() * 500);
    setTimeout(() => {
      this.botScheduled = false;
      try {
        this.runBotMove();
      } catch (error) {
        this.state.error = error instanceof Error ? error.message : "Bot error";
      }
      this.sendAll();
      // chain (e.g., uno skip puts bot to play again)
      if (this.isBotTurn()) this.maybeBotMove();
    }, delay);
  }

  runBotMove() {
    const bot = this.botIndex();
    if (bot < 0) return;
    const game = this.state.game;
    if (game === "chess") {
      const move = pickChessMove(this.state.fen);
      if (move) {
        try { chess(this.state, { type: "move", from: move.from, to: move.to, promotion: "q" }, bot); }
        catch { /* ignore */ }
      }
      return;
    }
    if (game === "connect-four") {
      const col = pickConnectFourMove(this.state.board, bot + 1, (1 - bot) + 1);
      if (col >= 0) {
        try { connectFour(this.state, { type: "drop", col }, bot); } catch { /* ignore */ }
      }
      return;
    }
    if (game === "uno") {
      runUnoBot(this.state, bot);
      return;
    }
    if (game === "guess-who") {
      runGuessWhoBot(this.state, bot);
      return;
    }
    if (game === "rummikub") {
      runRummikubBot(this.state, bot);
      return;
    }
  }
}

function view(state: AnyState, player: number) {
  const players = state.players.map((_, i) => `Player ${i + 1}`);
  const bots = state.players.map((p) => !!p.bot);
  const base: Record<string, any> = { ...state, players, bots, playerIndex: player };
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

// ===================== BOT LOGIC =====================

function pickChessMove(fen: string): { from: string; to: string } | null {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true }) as any[];
  if (moves.length === 0) return null;
  const captures = moves.filter((m) => m.captured);
  const checks = moves.filter((m) => m.san && m.san.includes("+"));
  const pool = captures.length > 0 ? captures : checks.length > 0 ? checks : moves;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { from: pick.from, to: pick.to };
}

function pickConnectFourMove(board: number[][], me: number, opp: number): number {
  const valid = (col: number) => board[0][col] === 0;
  const cols = [0, 1, 2, 3, 4, 5, 6].filter(valid);
  if (cols.length === 0) return -1;
  // (a) win
  for (const col of cols) if (simulateWin(board, col, me)) return col;
  // (b) block
  for (const col of cols) if (simulateWin(board, col, opp)) return col;
  // (c) center then random
  if (cols.includes(3)) return 3;
  return cols[Math.floor(Math.random() * cols.length)];
}

function simulateWin(board: number[][], col: number, mark: number): boolean {
  for (let row = 5; row >= 0; row--) {
    if (board[row][col] === 0) {
      board[row][col] = mark;
      const w = wins(board, row, col, mark);
      board[row][col] = 0;
      return w;
    }
  }
  return false;
}

function runUnoBot(state: AnyState, bot: number) {
  const hand = state.hands[bot] as any[];
  const top = state.top;
  const playable = hand.findIndex((c) => c.color === "wild" || c.color === top.color || c.value === top.value);
  if (playable >= 0) {
    const card = hand[playable];
    let chosen = card.color;
    if (card.color === "wild") {
      const counts: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
      for (const c of hand) if (counts[c.color] !== undefined) counts[c.color]++;
      chosen = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) || "red";
    }
    uno(state, { type: "play", id: card.id, color: chosen }, bot);
    return;
  }
  // draw, then try to play
  uno(state, { type: "draw" }, bot);
  // After draw, turn passes to opponent in current rules — that's fine.
}

function runGuessWhoBot(state: AnyState, bot: number) {
  // Pick secret if not yet picked
  if (state.secrets[bot] === null) {
    const id = Math.floor(Math.random() * 24);
    guessWho(state, { type: "secret", id }, bot);
    return;
  }
  if (state.secrets.some((s: number | null) => s === null)) return;
  if (state.turn !== bot) return;
  // Flip a random unflipped person
  const flipped: number[] = state.flipped[bot] ?? [];
  const unflipped = Array.from({ length: 24 }, (_, i) => i).filter((i) => !flipped.includes(i));
  if (unflipped.length > 1) {
    const id = unflipped[Math.floor(Math.random() * unflipped.length)];
    guessWho(state, { type: "flip", id }, bot);
  }
  // Ask a binary question (also passes turn)
  const questions = [
    "Do they wear glasses?",
    "Do they have a hat?",
    "Do they have a beard?",
    "Is their hair dark?",
    "Is their skin light?",
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  guessWho(state, { type: "ask", question: q }, bot);
}

function runRummikubBot(state: AnyState, bot: number) {
  const rack = state.racks[bot] as any[];
  // Try to find a valid group of 3 from the rack.
  const group = findRummikubGroup(rack);
  if (group) {
    rummikub(state, { type: "place", ids: group.map((t) => t.id) }, bot);
    // Check if rack still allows play; otherwise end turn.
    if (!state.winner && state.turn === bot) {
      rummikub(state, { type: "end" }, bot);
    }
    return;
  }
  rummikub(state, { type: "draw" }, bot);
}

function findRummikubGroup(rack: any[]): any[] | null {
  // same-number set: group by number, find any number with >=3 different colors.
  const byN: Record<string, any[]> = {};
  for (const t of rack) if (t.color !== "joker") (byN[t.n] ||= []).push(t);
  for (const n in byN) {
    const tiles = byN[n];
    const seen = new Set<string>();
    const picked: any[] = [];
    for (const t of tiles) if (!seen.has(t.color)) { seen.add(t.color); picked.push(t); }
    if (picked.length >= 3) return picked.slice(0, Math.min(4, picked.length));
  }
  // same-color run of 3+
  const byC: Record<string, any[]> = {};
  for (const t of rack) if (t.color !== "joker") (byC[t.color] ||= []).push(t);
  for (const c in byC) {
    const sorted = [...byC[c]].sort((a, b) => a.n - b.n);
    const seenN = new Set<number>();
    const dedup = sorted.filter((t) => { if (seenN.has(t.n)) return false; seenN.add(t.n); return true; });
    for (let i = 0; i + 2 < dedup.length; i++) {
      let j = i;
      while (j + 1 < dedup.length && dedup[j + 1].n === dedup[j].n + 1) j++;
      if (j - i + 1 >= 3) return dedup.slice(i, j + 1);
    }
  }
  return null;
}
