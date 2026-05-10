#!/usr/bin/env node
// End-to-end smoke test for game-hub rooms (multiplayer + CPU at each difficulty).
// Talks directly to the local PartyKit server. Pass `--host=...` to override.

import PartySocket from "partysocket";

const HOST = (process.argv.find((a) => a.startsWith("--host=")) || "--host=127.0.0.1:1999").split("=")[1];
const PARTIES = { chess: "chess", "connect-four": "connectfour", uno: "uno", "guess-who": "guesswho", rummikub: "rummikub" };
const GAMES = ["chess", "connect-four", "uno", "guess-who", "rummikub"];
const DIFFS = ["easy", "medium", "hard"];

let pass = 0, fail = 0;
function ok(msg) { pass++; console.log(`  ✓ ${msg}`); }
function bad(msg, err) { fail++; console.log(`  ✗ ${msg}${err ? `: ${err}` : ""}`); }

function rand6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function connect(game, code) {
  return new Promise((resolve, reject) => {
    const sock = new PartySocket({ host: HOST, party: PARTIES[game], room: code.toLowerCase() });
    const states = [];
    const waiters = [];
    sock.addEventListener("message", (event) => {
      const state = JSON.parse(event.data);
      states.push(state);
      const next = waiters.shift();
      if (next) next(state);
    });
    sock.addEventListener("open", () => resolve({
      sock,
      states,
      send: (msg) => sock.send(JSON.stringify(msg)),
      next: (predicate, timeoutMs = 4000) => new Promise((res, rej) => {
        // First check existing states.
        const existing = states.find(predicate);
        if (existing) return res(existing);
        const timer = setTimeout(() => rej(new Error("timeout waiting for state")), timeoutMs);
        const handler = (state) => {
          if (predicate(state)) { clearTimeout(timer); res(state); }
          else waiters.push(handler);
        };
        waiters.push(handler);
      }),
      close: () => sock.close(),
    }));
    sock.addEventListener("error", reject);
  });
}

async function testTwoPlayer(game) {
  const code = rand6();
  const a = await connect(game, code);
  const b = await connect(game, code);
  // Wait until both clients see started=true and 2 players.
  const stA = await a.next((s) => s.started === true && s.players.length === 2);
  const stB = await b.next((s) => s.started === true && s.players.length === 2);
  if (stA.playerIndex !== 0 || stB.playerIndex !== 1) throw new Error(`bad indices: ${stA.playerIndex}/${stB.playerIndex}`);
  // Play a single legal move and verify both clients see it.
  if (game === "chess") {
    a.send({ type: "move", from: "e2", to: "e4" });
    await b.next((s) => s.started && typeof s.fen === "string" && !s.fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"));
  } else if (game === "connect-four") {
    a.send({ type: "drop", col: 3 });
    await b.next((s) => s.started && Array.isArray(s.board) && s.board.flat().some((cell) => cell !== 0));
  } else if (game === "uno") {
    a.send({ type: "draw" });
    await b.next((s) => s.started && s.turn === 1);
  } else if (game === "guess-who") {
    a.send({ type: "secret", id: 0 });
    b.send({ type: "secret", id: 1 });
    // After both secrets are set, asks become legal. Wait until B sees its own secret = 1.
    await b.next((s) => s.started && Number(s.secret) === 1, 5000);
    a.send({ type: "ask", question: "test?" });
    await b.next((s) => s.started && Array.isArray(s.log) && s.log.length > 0, 5000);
  } else if (game === "rummikub") {
    a.send({ type: "draw" });
    await b.next((s) => s.started && s.turn === 1);
  }
  a.close(); b.close();
}

async function testCpu(game, difficulty) {
  const code = rand6();
  const a = await connect(game, code);
  a.send({ type: "init", vsCpu: true, difficulty });
  // Wait for game to start with a bot in slot 1.
  const start = await a.next((s) => s.started === true && s.players.length === 2 && s.bots?.[1] === true, 5000);
  if (start.difficulty !== difficulty) throw new Error(`difficulty not propagated: got ${start.difficulty}`);
  // Make a move that triggers the bot to respond, then wait for bot to act.
  if (game === "chess") {
    a.send({ type: "move", from: "e2", to: "e4" });
    // Bot replies → turn back to white with a non-default FEN.
    await a.next((s) => s.turn === "white" && typeof s.fen === "string" && !s.fen.startsWith("rnbqkbnr/pppppppp"), 8000);
  } else if (game === "connect-four") {
    a.send({ type: "drop", col: 3 });
    await a.next((s) => {
      if (!Array.isArray(s.board)) return false;
      const filled = s.board.flat().filter((x) => x !== 0).length;
      return filled >= 2 && s.turn === 0;
    }, 8000);
  } else if (game === "uno") {
    // Bot may be player 0 or 1 depending on who started — we are player 0, so it's our turn.
    // Play first by drawing; bot then plays/draws and we go again.
    a.send({ type: "draw" });
    await a.next((s) => s.started && s.turn === 0 && Array.isArray(s.hand), 8000);
  } else if (game === "guess-who") {
    // Bot needs to set its own secret asynchronously after start.
    await a.next((s) => s.started && Array.isArray(s.bots) && s.bots[1], 5000);
    // Set our secret; once both are set the bot will ask on its turn.
    a.send({ type: "secret", id: 0 });
    // Wait for bot's question OR for turn to come back to us.
    await a.next((s) => (Array.isArray(s.log) && s.log.length > 0) || s.turn === 0, 8000);
  } else if (game === "rummikub") {
    a.send({ type: "end" });
    await a.next((s) => s.started && s.turn === 0, 8000);
  }
  a.close();
}

async function main() {
  console.log(`Smoke test against ${HOST}\n`);

  console.log("Two-player rooms:");
  for (const game of GAMES) {
    try { await testTwoPlayer(game); ok(`${game}: 2-player room works`); }
    catch (err) { bad(`${game}: 2-player room`, err.message); }
  }

  console.log("\nCPU rooms:");
  for (const game of GAMES) {
    for (const diff of DIFFS) {
      try { await testCpu(game, diff); ok(`${game} vs CPU (${diff})`); }
      catch (err) { bad(`${game} vs CPU (${diff})`, err.message); }
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(2); });
