import Link from "next/link";
import { notFound } from "next/navigation";
import { RoomLauncher } from "@/components/RoomLauncher";
import { getGame } from "@/lib/games";

export default async function GameLobby({ params }: { params: Promise<{ game: string }> }) {
  const { game: gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-zinc-400 hover:text-white">Back to all games</Link>
      <section className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950/80">
        <div className={`h-2 bg-gradient-to-r ${game.accent}`} />
        <div className="p-6 sm:p-8">
          <h1 className="text-4xl font-bold tracking-tight text-white">{game.name}</h1>
          <p className="mt-3 max-w-2xl text-zinc-300">{game.blurb}</p>
          <RoomLauncher gameId={game.id} />
        </div>
      </section>
    </main>
  );
}
