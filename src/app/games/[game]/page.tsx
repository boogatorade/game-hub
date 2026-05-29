import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ActiveRooms } from "@/components/ActiveRooms";
import { RoomLauncher } from "@/components/RoomLauncher";
import { getGame } from "@/lib/games";

export default async function GameLobby({ params }: { params: Promise<{ game: string }> }) {
  const { game: gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  return (
    <main className="wrap lobby-page">
      <Link href="/#games" className="back-link">Back to all games</Link>
      <section className="lobby-card" style={{ "--tint": game.accent } as CSSProperties}>
        <div className="lobby-stripe" />
        <div className="lobby-body">
          <p className="eyebrow compact"><span className="dot" />{game.meta}</p>
          <h1>{game.name}</h1>
          <p>{game.blurb}</p>
          <RoomLauncher game={game} />
          <section className="tutorial">
            <h2>How to play</h2>
            <div className="video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${game.youtube}`}
                title={`${game.name} tutorial`}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </section>
          <div className="section-head compact-head">
            <h2>Public rooms</h2>
            <span className="count">tap to join</span>
          </div>
          <ActiveRooms gameId={game.id} />
        </div>
      </section>
    </main>
  );
}
