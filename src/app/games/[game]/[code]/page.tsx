import { notFound } from "next/navigation";
import { GameRoom } from "@/components/GameRoom";
import { getGame } from "@/lib/games";

export default async function RoomPage({ params }: { params: Promise<{ game: string; code: string }> }) {
  const { game: gameId, code } = await params;
  const game = getGame(gameId);
  if (!game || !/^[a-z0-9]{6}$/i.test(code)) notFound();
  return <GameRoom gameId={game.id} code={code.toUpperCase()} title={game.name} />;
}
