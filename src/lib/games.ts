export const games = [
  { id: "chess", name: "Chess", blurb: "Classic head-to-head chess with server-validated moves.", accent: "from-emerald-500 to-cyan-500", youtube: "fKxG8KjH1Qg" },
  { id: "connect-four", name: "Connect Four", blurb: "Drop discs, connect four, block fast.", accent: "from-amber-400 to-red-500", youtube: "ylZBRUJi3UQ" },
  { id: "uno", name: "Uno", blurb: "Original card art, color matching, skips, reverses, draw twos, wilds.", accent: "from-blue-500 to-fuchsia-500", youtube: "_CvaIyRE1Tw" },
  { id: "rummikub", name: "Rummikub", blurb: "Build valid sets and runs from numbered tiles.", accent: "from-violet-500 to-rose-500", youtube: "P9lThha3BLY" },
  { id: "battleship", name: "Battleship", blurb: "Place your fleet and sink the enemy's ships before they sink yours.", accent: "from-sky-500 to-indigo-600", youtube: "RgAqFJHLBNc" }
] as const;

export type GameId = (typeof games)[number]["id"];

export function getGame(id: string) {
  return games.find((game) => game.id === id);
}
