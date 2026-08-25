# CoCanvas

A collaborative canvas for thinking out loud, together. Draw, write, arrange and comment
on an infinite board, with everyone's cursors and edits arriving live.

## Running it

Two processes, and you want both. The Next app serves the pages and the API; the realtime
server carries the live document. Board CONTENT hydrates through the realtime room, so a
board opened without it will render its chrome and an empty canvas.

```bash
npm run dev                 # Next app  → http://localhost:3000
cd realtime && npm start    # y-websocket → ws://localhost:1234
```

## Environment

Copy the keys into `.env`:

| Variable | What it does | Required |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | yes |
| `AUTH_SECRET` | Auth.js session signing | yes |
| `NEXT_PUBLIC_REALTIME_URL` | Where the browser opens the y-websocket connection | yes |
| `RESEND_API_KEY` | Verification, password-reset and invite email | yes |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google sign-in | optional |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub sign-in | optional |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for image upload onto a board | optional |
| `NEXT_PUBLIC_SYNC_HUD=1` | Shows the realtime diagnostic overlay in dev | optional |

Without `BLOB_READ_WRITE_TOKEN`, dropping an image onto a board fails with a visible
error; everything else works.

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm test         # node:test over src/**/*.test.ts and realtime/*.test.js
npm run lint     # eslint
```

Database changes go through Prisma. After `npx prisma migrate dev`, run
`npx prisma generate` and restart the dev server — a running server keeps serving the old
client and the type errors will not tell you why.

## Layout

| Path | What lives there |
|---|---|
| `src/app` | Routes, API handlers, `globals.css` (the design tokens) |
| `src/components` | UI. `BoardCanvas.tsx` is the canvas renderer and owns the draw loop |
| `src/lib` | Pure logic — geometry, colour, sync, tokens. Where the tests point |
| `prisma` | Schema and migrations |
| `realtime` | The y-websocket server |

`src/lib` is deliberately free of React and DOM so it can be tested with `node:test` and
no browser.
