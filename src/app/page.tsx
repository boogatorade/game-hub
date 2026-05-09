import Link from "next/link";
import { games } from "@/lib/games";
import { RequestGameForm } from "@/components/RequestGameForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8">
      <section className="grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Multiplayer browser games</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold tracking-tight text-white sm:text-7xl">Game Hub</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
            Create a room, share a six-character code, and play server-authoritative two-player games in the browser.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-zinc-300">
          Realtime rooms run through PartyKit. Each move is sent as an intent and validated on the server before both clients update.
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/games/${game.id}`}
            className="group overflow-hidden rounded-lg border border-white/10 bg-zinc-950/80 transition hover:-translate-y-0.5 hover:border-white/25"
          >
            <div className={`h-2 bg-gradient-to-r ${game.accent}`} />
            <div className="p-5">
              <h2 className="text-2xl font-semibold text-white">{game.name}</h2>
              <p className="mt-3 min-h-16 text-sm leading-6 text-zinc-400">{game.blurb}</p>
              <span className="mt-5 inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-950 group-hover:bg-cyan-200">
                Open lobby
              </span>
            </div>
          </Link>
        ))}
      </section>
      <section className="grid gap-5 md:grid-cols-[1fr_1.4fr] md:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Have an idea?</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Request a Game</h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
            Want a different game added to the hub? Drop a note and it&rsquo;ll land in the inbox.
          </p>
        </div>
        <RequestGameForm />
      </section>
    </main>
  );
}
