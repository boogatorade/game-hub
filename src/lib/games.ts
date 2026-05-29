export const games = [
  {
    id: "chess",
    name: "Chess",
    blurb: "The classic. Choose your side and play with a clock or take your time.",
    launcherSub: "Pick your side, set the clock, and invite a friend.",
    accent: "#ead7b8",
    meta: "2 players · 10-30 min",
    youtube: "fKxG8KjH1Qg",
  },
  {
    id: "connect-four",
    name: "Connect Four",
    blurb: "Drop discs, line up four. First to think three moves ahead wins.",
    launcherSub: "First to four in a row. Choose who drops first.",
    accent: "#e85a4f",
    meta: "2 players · 5-10 min",
    youtube: "ylZBRUJi3UQ",
  },
  {
    id: "uno",
    name: "Uno",
    blurb: "Match colors, skip, reverse, stack draw twos. Wilds change everything.",
    launcherSub: "House rules optional - stacking, jump-in, seven-zero.",
    accent: "#f5c84b",
    meta: "2-8 players · 15 min",
    youtube: "_CvaIyRE1Tw",
  },
  {
    id: "rummikub",
    name: "Rummikub",
    blurb: "Build runs and groups, rearrange the table on your turn. Jokers welcome.",
    launcherSub: "Build sets and runs. Rearrange the table on your turn.",
    accent: "#f08a3b",
    meta: "2-4 players · 30 min",
    youtube: "P9lThha3BLY",
  },
  {
    id: "battleship",
    name: "Battleship",
    blurb: "Place your fleet, call your shots, and sink the enemy before they find you.",
    launcherSub: "Plot your ships, scan the grid, and take turns firing.",
    accent: "#3b82f6",
    meta: "2 players · 10-15 min",
    youtube: "RgAqFJHLBNc",
  },
] as const;

export type GameId = (typeof games)[number]["id"];

export function getGame(id: string) {
  return games.find((game) => game.id === id);
}
