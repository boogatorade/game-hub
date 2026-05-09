# Game Hub

Multiplayer browser games built with Next.js App Router, TypeScript, Tailwind CSS, and PartyKit.

## Realtime

PartyKit is the realtime backend. The Next.js app connects with `NEXT_PUBLIC_PARTYKIT_HOST` and each game uses its own PartyKit party name:

- `chess`
- `connectfour` for the public `connect-four` game
- `uno`
- `guesswho` for the public `guess-who` game
- `rummikub`

No fallback backend was used.

## Local Development

```bash
npm run party:dev
npm run dev
```

Set `.env.local`:

```bash
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999
```

## Deploy

```bash
npx partykit deploy
vercel --prod --yes
```

Set `NEXT_PUBLIC_PARTYKIT_HOST` in Vercel production to the PartyKit host, without protocol.

## Game Status

- Chess: working. Server validates moves with `chess.js`.
- Connect Four: working. Server validates drops and wins.
- Uno: partial but playable. Server validates color/value/wild matches and action effects. Hands are private per player, but stacking/challenge rules are omitted.
- Guess Who: partial but playable. Server tracks secret picks, per-player flips, questions, and turns. Yes/no answers are handled socially in text, not enforced.
- Rummikub: partial. Server supports drawing, placing same-number sets or same-color runs, and ending turns. Full table rearrangement and initial meld scoring are omitted.

## Stripe

`/api/stripe` returns `501 Not Implemented`.
