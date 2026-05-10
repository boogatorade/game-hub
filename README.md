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

Set the Guess Who judge API key in PartyKit before relying on automatic yes/no answers:

```bash
npx partykit env add XAI_API_KEY
```

Paste an xAI API key when prompted (get one at https://console.x.ai — uses `grok-3-mini`). `GROK_API_KEY` is accepted as a fallback name. If the env var is missing the judge gracefully records "judge unavailable" instead of failing the turn.

## Game Status

- Chess: working. Server validates moves with `chess.js`.
- Connect Four: working. Server validates drops and wins.
- Uno: partial but playable. Server validates color/value/wild matches and action effects. Hands are private per player, but stacking/challenge rules are omitted.
- Guess Who: partial but playable. Server tracks secret picks, per-player flips, questions, and turns. Yes/no questions can be answered by the PartyKit Anthropic judge when `ANTHROPIC_API_KEY` is configured.
- Rummikub: partial. Server supports drawing, placing same-number sets or same-color runs, adding tiles to existing table groups, and ending turns. Full table rearrangement and initial meld scoring are omitted.

## Stripe

`/api/stripe` returns `501 Not Implemented`.

## Email configuration

The homepage **Request a Game** form posts to `/api/game-request`, which emails `boogatorade@gmail.com` over Gmail SMTP via `nodemailer`. Set up a Gmail App Password and configure two env vars in Vercel.

### Get a Gmail App Password

1. Sign in to the Google account that will send the mail (likely `boogatorade@gmail.com`).
2. Enable 2-Step Verification on that account if it is not already on.
3. Visit https://myaccount.google.com/apppasswords.
4. Create a new App Password (label it `Game Hub`). Google returns a 16-character password — copy it now, it is shown only once.

### Vercel env vars

In the Vercel dashboard for the project, add the following to the **Production** environment (and Preview if you want it active there):

- `GMAIL_USER` — the full Gmail address that sends the mail (e.g. `boogatorade@gmail.com`).
- `GMAIL_APP_PASSWORD` — the 16-character App Password from step 4. Spaces are fine; Gmail accepts it either way.

Redeploy after adding them. While the vars are missing, the API route returns `503 { "error": "Email not configured" }` and the form surfaces the error — it does not crash.
