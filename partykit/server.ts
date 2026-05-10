import type * as Party from "partykit/server";
import { Chess } from "chess.js";

type Conn = Party.Connection<{ player?: number }>;
type Player = { id: string; bot?: boolean };
type Difficulty = "easy" | "medium" | "hard";
type ChatState = {
  status: "idle" | "pending" | "active";
  requestedBy: number | null;
  messages: { from: number; text: string; ts: number }[];
};
type RummikubTile = { id: string; color: string; n: number | "J" };
type AnyState = Record<string, any> & {
  game: string;
  players: Player[];
  started: boolean;
  error?: string;
  vsCpu?: boolean;
  difficulty?: Difficulty;
  chat?: ChatState;
};

const BOT_ID = "__cpu_bot__";

function normalizeDifficulty(value: unknown): Difficulty {
  return value === "easy" || value === "hard" ? value : "medium";
}

export default class GameServer implements Party.Server {
  state: AnyState;
  botScheduled = false;
  constructor(readonly room: Party.Room) {
    const publicName: Record<string, string> = { connectfour: "connect-four", guesswho: "guess-who" };
    this.state = { game: publicName[room.name] || room.name, players: [], started: false };
  }

  async onRequest(request: Party.Request) {
    if (request.method === "POST") {
      try {
        const body = await request.json() as { kind?: string; group?: RummikubTile[]; existing?: RummikubTile[]; added?: RummikubTile[] };
        if (body.kind === "rummikub-validate") {
          const group = Array.isArray(body.group) ? body.group : [];
          const existing = Array.isArray(body.existing) ? body.existing : [];
          const added = Array.isArray(body.added) ? body.added : [];
          const merged = existing.length > 0 ? mergeRummikubGroup(existing, added) : null;
          return Response.json({ valid: existing.length > 0 ? !!merged : validGroup(group), merged });
        }
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
    }
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
    if (this.state.players.length === 0) void this.removeFromLobby();
    this.sendAll();
  }

  onMessage(raw: string, conn: Conn) {
    const player = this.state.players.findIndex((p) => p.id === conn.id);
    const msg = JSON.parse(raw);

    // Init: enable CPU mode if no game has started and no bot yet.
    if (msg && msg.type === "init" && msg.vsCpu && !this.state.started && !this.state.vsCpu) {
      this.state.vsCpu = true;
      this.state.difficulty = normalizeDifficulty(msg.difficulty);
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
      if (handleChat(this.state, msg, player)) {
        this.sendAll();
        return;
      }
      if (this.state.game === "chess") chess(this.state, msg, player);
      if (this.state.game === "connect-four") connectFour(this.state, msg, player);
      if (this.state.game === "uno") uno(this.state, msg, player);
      if (this.state.game === "guess-who") guessWho(this.state, msg, player, this.room.env, () => this.sendAll());
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
    void this.pingLobby();
  }

  base() {
    return {
      game: this.state.game,
      players: this.state.players,
      started: true,
      vsCpu: this.state.vsCpu,
      difficulty: this.state.difficulty,
      chat: createChat(),
    };
  }

  sendAll() {
    for (const conn of this.room.getConnections() as Iterable<Conn>) {
      const player = this.state.players.findIndex((p) => p.id === conn.id);
      conn.send(JSON.stringify(view(this.state, player)));
    }
    void this.pingLobby();
  }

  async pingLobby() {
    try {
      await this.room.context.parties.lobby.get("default").fetch({
        method: "POST",
        body: JSON.stringify({
          kind: "upsert",
          game: this.state.game,
          code: this.room.id,
          players: this.state.players.length,
          started: !!this.state.started,
        }),
      });
    } catch {
      // Lobby discovery is best-effort; gameplay should never fail because it is unavailable.
    }
  }

  async removeFromLobby() {
    try {
      await this.room.context.parties.lobby.get("default").fetch({
        method: "POST",
        body: JSON.stringify({ kind: "remove", game: this.state.game, code: this.room.id }),
      });
    } catch {
      // Best-effort cleanup; stale entries also expire in the lobby party.
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
    const difficulty: Difficulty = this.state.difficulty || "medium";
    const game = this.state.game;
    if (game === "chess") {
      const move = pickChessMove(this.state.fen, difficulty);
      if (move) {
        try { chess(this.state, { type: "move", from: move.from, to: move.to, promotion: "q" }, bot); }
        catch { /* ignore */ }
      }
      return;
    }
    if (game === "connect-four") {
      const col = pickConnectFourMove(this.state.board, bot + 1, (1 - bot) + 1, difficulty);
      if (col >= 0) {
        try { connectFour(this.state, { type: "drop", col }, bot); } catch { /* ignore */ }
      }
      return;
    }
    if (game === "uno") {
      runUnoBot(this.state, bot, difficulty);
      return;
    }
    if (game === "guess-who") {
      runGuessWhoBot(this.state, bot, difficulty, this.room.env, () => this.sendAll());
      return;
    }
    if (game === "rummikub") {
      runRummikubBot(this.state, bot, difficulty);
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
  if (state.game === "uno" && player >= 0 && Array.isArray(state.hands)) {
    return { ...base, hand: state.hands[player] ?? [], opponentCount: state.hands[1 - player]?.length ?? 0, deckCount: state.deck?.length ?? 0 };
  }
  if (state.game === "guess-who" && player >= 0 && Array.isArray(state.secrets)) {
    return { ...base, secret: state.secrets[player] ?? null, flipped: state.flipped?.[player] ?? [] };
  }
  if (state.game === "rummikub" && player >= 0 && Array.isArray(state.racks)) {
    return { ...base, rack: state.racks[player] ?? [], poolCount: state.pool?.length ?? 0 };
  }
  return base;
}

function createChat(): ChatState {
  return { status: "idle", requestedBy: null, messages: [] };
}

function chat(state: AnyState): ChatState {
  if (!state.chat) state.chat = createChat();
  return state.chat;
}

function handleChat(state: AnyState, msg: { type?: string; text?: unknown }, player: number): boolean {
  if (!msg.type || !msg.type.startsWith("chat-")) return false;
  if (state.vsCpu) return true;
  const current = chat(state);
  if (msg.type === "chat-request") {
    if (current.status === "idle") {
      current.status = "pending";
      current.requestedBy = player;
    }
    return true;
  }
  if (msg.type === "chat-accept") {
    if (current.status === "pending" && current.requestedBy !== player) current.status = "active";
    return true;
  }
  if (msg.type === "chat-decline") {
    if (current.status === "pending" && current.requestedBy !== player) {
      current.status = "idle";
      current.requestedBy = null;
    }
    return true;
  }
  if (msg.type === "chat-send") {
    if (current.status === "active") {
      const text = String(msg.text || "").trim().slice(0, 500);
      if (text) {
        current.messages.push({ from: player, text, ts: Date.now() });
        current.messages = current.messages.slice(-100);
      }
    }
    return true;
  }
  return false;
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

function guessWho(state: AnyState, msg: any, player: number, env?: Record<string, unknown>, notify?: () => void) {
  if (msg.type === "secret" && state.secrets[player] === null) state.secrets[player] = Number(msg.id);
  if (state.secrets.some((x: number | null) => x === null)) return;
  if (msg.type === "flip") {
    const id = Number(msg.id);
    if (!state.flipped[player].includes(id)) state.flipped[player].push(id);
  }
  if (msg.type === "ask") {
    if (state.turn !== player) throw new Error("Not your turn");
    const question = String(msg.question || "").slice(0, 120);
    if (question) {
      state.log.push(`Player ${player + 1}: ${question}`);
      const secret = state.secrets[1 - player];
      if (typeof secret === "number") {
        state.judgeCalls = Number(state.judgeCalls || 0);
        if (state.judgeCalls < 100) {
          state.judgeCalls++;
          void judgeQuestion(env, guessWhoTraits(secret), question).then((answer) => {
            if (answer === "unclear") state.log.push(`Player ${1 - player + 1} couldn't answer (judge unavailable)`);
            else state.log.push(`Player ${1 - player + 1} answers: ${answer}`);
            notify?.();
          }).catch(() => {
            state.log.push(`Player ${1 - player + 1} couldn't answer (judge unavailable)`);
            notify?.();
          });
        }
      }
    }
    state.turn = 1 - player;
  }
}

function guessWhoTraits(id: number): string {
  const skins = ["light skin", "medium skin", "dark skin", "tan skin"];
  const hair = ["dark hair", "auburn hair", "blond hair", "gray hair"];
  return [
    `The character has ${hair[id % 4]}`,
    id % 3 === 0 ? "glasses" : "no glasses",
    id % 5 === 0 ? "a hat" : "no hat",
    id % 4 === 0 ? "a beard" : "no beard",
    skins[id % 4],
  ].join(", ");
}

async function judgeQuestion(env: Record<string, unknown> | undefined, traits: string, question: string): Promise<"yes" | "no" | "unclear"> {
  const apiKey =
    (typeof env?.GROQ_API_KEY === "string" && env.GROQ_API_KEY) ||
    "";
  if (!apiKey) return "unclear";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 5,
      temperature: 0,
      messages: [{ role: "user", content: `Character traits: ${traits}. Question: "${question}". Answer with exactly one word: "yes" or "no".` }],
    }),
  });
  if (!response.ok) return "unclear";
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  const text = String(data.choices?.[0]?.message?.content || "").trim().toLowerCase().slice(0, 3);
  if (text.startsWith("yes")) return "yes";
  if (text.startsWith("no")) return "no";
  return "unclear";
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
  if (group.length !== ids.size) throw new Error("Tile not in rack");
  if (Number.isInteger(msg.into)) {
    const into = Number(msg.into);
    const existing = state.table[into];
    if (!Array.isArray(existing)) throw new Error("Table group not found");
    const merged = mergeRummikubGroup(existing, group);
    if (!merged) throw new Error("Placed tiles must keep the table group valid");
    state.racks[player] = state.racks[player].filter((t: RummikubTile) => !ids.has(t.id));
    state.table[into] = merged;
    if (state.racks[player].length === 0) state.winner = player;
    return;
  }
  if (!validGroup(group)) throw new Error("Group must be same-number different-color set of 3-4, or same-color run of 3+");
  state.racks[player] = state.racks[player].filter((t: RummikubTile) => !ids.has(t.id));
  state.table.push(group);
  if (state.racks[player].length === 0) state.winner = player;
}

function mergeRummikubGroup(existing: RummikubTile[], added: RummikubTile[]): RummikubTile[] | null {
  const append = [...existing, ...added];
  if (validGroup(append)) return append;
  const prepend = [...added, ...existing];
  if (validGroup(prepend)) return prepend;
  return null;
}

function validGroup(group: RummikubTile[]) {
  if (group.length < 3) return false;
  const jokers = group.filter((t) => t.color === "joker").length;
  const tiles = group.filter((t) => t.color !== "joker" && typeof t.n === "number") as (RummikubTile & { n: number })[];

  const set = (() => {
    if (group.length < 3 || group.length > 4 || tiles.length === 0) return false;
    const n = tiles[0].n;
    if (!tiles.every((t) => t.n === n)) return false;
    return new Set(tiles.map((t) => t.color)).size === tiles.length && tiles.length + jokers === group.length;
  })();

  const run = (() => {
    if (group.length < 3 || tiles.length === 0) return false;
    const color = tiles[0].color;
    if (!tiles.every((t) => t.color === color)) return false;
    const sorted = [...tiles].sort((a, b) => a.n - b.n);
    const numbers = sorted.map((t) => t.n);
    if (new Set(numbers).size !== numbers.length) return false;
    const gaps = numbers.slice(1).reduce((total, n, i) => total + Math.max(0, n - numbers[i] - 1), 0);
    const span = numbers[numbers.length - 1] - numbers[0] + 1;
    return gaps <= jokers && span <= group.length && numbers[0] >= 1 && numbers[numbers.length - 1] <= 13;
  })();

  return set || run;
}

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

// ===================== BOT LOGIC =====================

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function pickChessMove(fen: string, difficulty: Difficulty): { from: string; to: string } | null {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true }) as any[];
  if (moves.length === 0) return null;

  if (difficulty === "easy") {
    // Pure random: occasionally throws away material.
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return { from: pick.from, to: pick.to };
  }

  if (difficulty === "medium") {
    // Prefer captures, then checks, then random.
    const captures = moves.filter((m) => m.captured);
    const checks = moves.filter((m) => m.san && m.san.includes("+"));
    const pool = captures.length > 0 ? captures : checks.length > 0 ? checks : moves;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { from: pick.from, to: pick.to };
  }

  // Hard: 2-ply minimax with material + mobility scoring.
  let best: any = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const probe = new Chess(fen);
    probe.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
    if (probe.isCheckmate()) return { from: move.from, to: move.to };
    let score = chessMaterial(probe);
    if (move.san && move.san.includes("+")) score += 0.4;
    // Opponent's best reply
    const replies = probe.moves({ verbose: true }) as any[];
    let worst = Infinity;
    for (const reply of replies) {
      const next = new Chess(probe.fen());
      next.move({ from: reply.from, to: reply.to, promotion: reply.promotion || "q" });
      const replyScore = chessMaterial(next);
      if (replyScore < worst) worst = replyScore;
    }
    if (replies.length > 0) score = Math.min(score, worst + 0.0001);
    score += (Math.random() - 0.5) * 0.05;
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best ? { from: best.from, to: best.to } : { from: moves[0].from, to: moves[0].to };
}

function chessMaterial(game: Chess): number {
  // From bot's perspective: bot is whoever just moved (opposite of current turn).
  const board = game.board();
  const botColor = game.turn() === "w" ? "b" : "w";
  let score = 0;
  for (const row of board) {
    for (const square of row) {
      if (!square) continue;
      const value = PIECE_VALUE[square.type] || 0;
      score += square.color === botColor ? value : -value;
    }
  }
  return score;
}

function pickConnectFourMove(board: number[][], me: number, opp: number, difficulty: Difficulty): number {
  const valid = (col: number) => board[0][col] === 0;
  const cols = [0, 1, 2, 3, 4, 5, 6].filter(valid);
  if (cols.length === 0) return -1;

  if (difficulty === "easy") {
    // Half the time take a winning move; otherwise totally random.
    if (Math.random() < 0.5) {
      for (const col of cols) if (simulateWin(board, col, me)) return col;
    }
    return cols[Math.floor(Math.random() * cols.length)];
  }

  if (difficulty === "medium") {
    // Win or block, but randomize among equivalent tactical moves.
    const wins = cols.filter((col) => simulateWin(board, col, me));
    if (wins.length > 0) return wins[Math.floor(Math.random() * wins.length)];
    const blocks = cols.filter((col) => simulateWin(board, col, opp));
    if (blocks.length > 0) return blocks[Math.floor(Math.random() * blocks.length)];
    if (Math.random() < 0.1) return cols[Math.floor(Math.random() * cols.length)];
    const nearCenter = cols.filter((col) => Math.abs(3 - col) <= 1);
    if (nearCenter.length > 0) return nearCenter[Math.floor(Math.random() * nearCenter.length)];
    return cols[Math.floor(Math.random() * cols.length)];
  }

  // Hard: minimax with depth 4, alpha-beta.
  const cloned = board.map((row) => row.slice());
  const result = c4Minimax(cloned, 4, -Infinity, Infinity, true, me, opp);
  if (result.col >= 0) return result.col;
  return cols[0];
}

function c4Minimax(board: number[][], depth: number, alpha: number, beta: number, maximizing: boolean, me: number, opp: number): { col: number; score: number } {
  const valid = [0, 1, 2, 3, 4, 5, 6].filter((c) => board[0][c] === 0);
  // Terminal check
  const terminal = c4Terminal(board, me, opp);
  if (terminal !== null || depth === 0 || valid.length === 0) {
    if (terminal === me) return { col: -1, score: 1_000_000 + depth };
    if (terminal === opp) return { col: -1, score: -1_000_000 - depth };
    if (terminal === 0) return { col: -1, score: 0 };
    return { col: -1, score: c4Heuristic(board, me, opp) };
  }
  // Center-biased ordering with randomized order inside equal-distance bands.
  const ordered = c4OrderedCols(valid);
  let bestCol = ordered[0];
  if (maximizing) {
    let value = -Infinity;
    for (const col of ordered) {
      const row = c4Drop(board, col, me);
      if (row < 0) continue;
      const next = c4Minimax(board, depth - 1, alpha, beta, false, me, opp).score + (Math.random() - 0.5) * 0.5;
      board[row][col] = 0;
      if (next > value) { value = next; bestCol = col; }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return { col: bestCol, score: value };
  } else {
    let value = Infinity;
    for (const col of ordered) {
      const row = c4Drop(board, col, opp);
      if (row < 0) continue;
      const next = c4Minimax(board, depth - 1, alpha, beta, true, me, opp).score + (Math.random() - 0.5) * 0.5;
      board[row][col] = 0;
      if (next < value) { value = next; bestCol = col; }
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return { col: bestCol, score: value };
  }
}

function c4OrderedCols(valid: number[]): number[] {
  const ordered: number[] = [];
  for (const distance of [0, 1, 2, 3]) {
    const band = valid.filter((col) => Math.abs(3 - col) === distance);
    shuffle(band);
    ordered.push(...band);
  }
  return ordered;
}

function c4Drop(board: number[][], col: number, mark: number): number {
  for (let row = 5; row >= 0; row--) {
    if (board[row][col] === 0) { board[row][col] = mark; return row; }
  }
  return -1;
}

function c4Terminal(board: number[][], me: number, opp: number): number | null {
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const mark = board[r][c];
      if (mark === 0) continue;
      if (wins(board, r, c, mark)) return mark;
    }
  }
  for (let c = 0; c < 7; c++) if (board[0][c] === 0) return null;
  return 0; // draw
  void me; void opp;
}

function c4Heuristic(board: number[][], me: number, opp: number): number {
  let score = 0;
  // Center column bonus
  for (let r = 0; r < 6; r++) {
    if (board[r][3] === me) score += 3;
    else if (board[r][3] === opp) score -= 3;
  }
  // Score every 4-window
  const lines: number[][][] = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) lines.push([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]);
  for (let c = 0; c < 7; c++) for (let r = 0; r < 3; r++) lines.push([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) lines.push([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]);
  for (let r = 3; r < 6; r++) for (let c = 0; c < 4; c++) lines.push([[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]]);
  for (const line of lines) {
    let mine = 0, theirs = 0;
    for (const [r, c] of line) {
      if (board[r][c] === me) mine++;
      else if (board[r][c] === opp) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 5;
    else if (mine === 2) score += 2;
    if (theirs === 3) score -= 4;
    else if (theirs === 2) score -= 2;
  }
  return score;
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

function runUnoBot(state: AnyState, bot: number, difficulty: Difficulty) {
  const hand = state.hands[bot] as any[];
  const top = state.top;
  const playableIdx: number[] = [];
  hand.forEach((c, i) => {
    if (c.color === "wild" || c.color === top.color || c.value === top.value) playableIdx.push(i);
  });

  if (playableIdx.length === 0) {
    uno(state, { type: "draw" }, bot);
    return;
  }

  let chosenIdx: number;
  if (difficulty === "easy") {
    chosenIdx = playableIdx[Math.floor(Math.random() * playableIdx.length)];
  } else {
    // Medium and Hard: prioritize action cards; Hard also saves wilds for when opponent is close to winning.
    const opponentCount = (state.hands[1 - bot] as any[]).length;
    const score = (card: any) => {
      if (card.value === "+2") return 100;
      if (card.value === "skip") return 90;
      if (card.value === "reverse") return 85;
      if (card.color === "wild") return difficulty === "hard" && opponentCount > 3 ? 30 : 80;
      return 50 + Number(card.value || 0);
    };
    chosenIdx = playableIdx.reduce((a, b) => (score(hand[b]) > score(hand[a]) ? b : a));
  }

  const card = hand[chosenIdx];
  let chosen = card.color;
  if (card.color === "wild") {
    const counts: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of hand) if (counts[c.color] !== undefined) counts[c.color]++;
    if (difficulty === "easy") {
      const colors = ["red", "yellow", "green", "blue"];
      chosen = colors[Math.floor(Math.random() * colors.length)];
    } else {
      chosen = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) || "red";
    }
  }
  uno(state, { type: "play", id: card.id, color: chosen }, bot);
}

function runGuessWhoBot(state: AnyState, bot: number, difficulty: Difficulty, env?: Record<string, unknown>, notify?: () => void) {
  // Pick secret if not yet picked
  if (state.secrets[bot] === null) {
    const id = Math.floor(Math.random() * 24);
    guessWho(state, { type: "secret", id }, bot, env, notify);
    return;
  }
  if (state.secrets.some((s: number | null) => s === null)) return;
  if (state.turn !== bot) return;

  const flipped: number[] = state.flipped[bot] ?? [];
  const unflipped = Array.from({ length: 24 }, (_, i) => i).filter((i) => !flipped.includes(i));

  // Flip count scales with difficulty: easy almost never flips, hard flips
  // multiple to narrow the field aggressively.
  const flipsPerTurn = difficulty === "easy" ? (Math.random() < 0.4 ? 1 : 0) : difficulty === "medium" ? 1 : Math.min(3, Math.max(1, Math.floor(unflipped.length / 6)));
  for (let i = 0; i < flipsPerTurn && unflipped.length > 1; i++) {
    const idx = Math.floor(Math.random() * unflipped.length);
    const id = unflipped.splice(idx, 1)[0];
    guessWho(state, { type: "flip", id }, bot, env, notify);
  }

  const easyQuestions = ["Do they look friendly?", "Do you like them?", "Hmm... interesting?"];
  const goodQuestions = [
    "Do they wear glasses?",
    "Do they have a hat?",
    "Do they have a beard?",
    "Is their hair dark?",
    "Is their skin light?",
  ];
  const pool = difficulty === "easy" ? easyQuestions : goodQuestions;
  const q = pool[Math.floor(Math.random() * pool.length)];
  guessWho(state, { type: "ask", question: q }, bot, env, notify);
}

function runRummikubBot(state: AnyState, bot: number, difficulty: Difficulty) {
  const rack = state.racks[bot] as any[];

  // Easy: only places with 50% chance, otherwise just draws.
  if (difficulty === "easy" && Math.random() < 0.5) {
    rummikub(state, { type: "draw" }, bot);
    return;
  }

  // Hard: keep placing groups in the same turn until none are left.
  const placeAll = difficulty === "hard";
  let placed = false;
  while (true) {
    const group = findRummikubGroup(state.racks[bot]);
    if (!group) break;
    rummikub(state, { type: "place", ids: group.map((t) => t.id) }, bot);
    placed = true;
    if (state.winner !== null && state.winner !== undefined) return;
    if (!placeAll) break;
  }

  if (placed && state.turn === bot) {
    rummikub(state, { type: "end" }, bot);
    return;
  }
  if (!placed) rummikub(state, { type: "draw" }, bot);
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
