"use client";

import type { CSSProperties } from "react";
import { games } from "@/lib/games";
import { ActiveRooms } from "@/components/ActiveRooms";
import { RequestGameForm } from "@/components/RequestGameForm";
import { RoomLauncher } from "@/components/RoomLauncher";

export default function Home() {
  return (
    <main className="wrap">
      <section className="hero">
        <div className="eyebrow"><span className="dot" />online · realtime · play with friends</div>
        <h1 className="title">Game night, <em>any night.</em></h1>
        <div className="hero-row">
          <p className="lede">
            Spin up a private room, share a six-character code, and pull a friend in from anywhere. No accounts, no downloads - just open a tab and play.
          </p>
          <div className="stats" aria-label="Game Hub stats">
            <div className="stat">
              <span className="v">{games.length}</span>
              <span className="l">Games available</span>
            </div>
            <div className="stat">
              <span className="v">2-8</span>
              <span className="l">Players per room</span>
            </div>
            <div className="stat">
              <span className="v"><span className="live-dot" />0s</span>
              <span className="l">Setup time</span>
            </div>
          </div>
        </div>
      </section>

      <div className="section-head" id="games">
        <h2>Pick a game</h2>
        <span className="count">05 / 05</span>
      </div>
      <section className="games" aria-label="Games">
        {games.map((game) => (
          <RoomLauncher key={game.id} game={game} trigger={(open) => (
            <button type="button" className="game" style={{ "--tint": game.accent } as CSSProperties} onClick={open}>
              <div className="art">
                <GameArt gameId={game.id} />
              </div>
              <div className="body">
                <div className="meta">
                  <span><span className="tint-dot" />{game.meta}</span>
                </div>
                <h3>{game.name}</h3>
                <p className="desc">{game.blurb}</p>
                <span className="play">Open lobby <span className="arrow">→</span></span>
              </div>
            </button>
          )} />
        ))}
      </section>

      <section className="how-it-works" id="how-it-works">
        <div>
          <span className="eyebrow compact"><span className="dot" />how it works</span>
          <h2>Rooms that stay simple.</h2>
        </div>
        <p>
          Realtime rooms run through PartyKit. Each move is sent as an intent and validated on the server before both clients update.
        </p>
      </section>

      <div className="section-head" id="public-rooms">
        <h2>Public rooms</h2>
        <span className="count">tap to join</span>
      </div>
      <ActiveRooms />

      <section className="request-section">
        <div>
          <p className="eyebrow compact"><span className="dot" />have an idea?</p>
          <h2>Request a game</h2>
          <p>
            Want a different game added to the hub? Drop a note and it will land in the inbox.
          </p>
        </div>
        <RequestGameForm />
      </section>
    </main>
  );
}

function GameArt({ gameId }: { gameId: string }) {
  if (gameId === "chess") {
    return (
      <div className="art-chess-wrap">
        <div className="art-chess">
          {Array.from({ length: 64 }, (_, index) => (
            <span key={index} className={(Math.floor(index / 8) + index) % 2 ? "d" : ""} />
          ))}
        </div>
        <div className="king">♚</div>
      </div>
    );
  }
  if (gameId === "connect-four") {
    const filled: Record<number, string> = { 37: "r", 38: "y", 39: "r", 30: "y", 31: "r", 32: "y", 24: "r", 25: "r", 18: "r" };
    return (
      <div className="art-c4">
        {Array.from({ length: 42 }, (_, index) => <span key={index} className={filled[index] || "h"} />)}
      </div>
    );
  }
  if (gameId === "uno") {
    return (
      <div className="art-uno">
        <div className="uno-card uno-1"><span>4</span></div>
        <div className="uno-card uno-2"><span>+2</span></div>
        <div className="uno-card uno-3"><span>9</span></div>
      </div>
    );
  }
  if (gameId === "rummikub") {
    return (
      <div className="art-rm">
        <div className="rm-tile n-black r-a">7</div>
        <div className="rm-tile n-red r-b">8</div>
        <div className="rm-tile n-blue r-c">9</div>
        <div className="rm-tile n-orange r-d">10</div>
        <div className="rm-tile rm-joker r-e"><span>★</span></div>
      </div>
    );
  }
  return (
    <div className="art-battleship">
      {Array.from({ length: 25 }, (_, index) => (
        <span key={index} className={[6, 7, 8, 17, 22].includes(index) ? "ship" : [3, 13, 20].includes(index) ? "peg" : ""} />
      ))}
    </div>
  );
}
