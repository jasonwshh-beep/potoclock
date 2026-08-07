# W Profit Pot — Railway / Kick Stream Widget

A simple admin + OBS overlay for kick.com/w.

## What it does

- Add a viewer/caller name and the dollar amount you are putting into the pot after a profitable bonus.
- Every profitable call creates **1 giveaway entry**.
- Repeat profitable calls from the same viewer create additional entries.
- Tracks the total pot, total entries, unique callers, call history, and a caller leaderboard.
- Roll one random entry for the entire pot.
- OBS-friendly overlay at `/overlay` with a 5-second rolling animation and winner reveal.
- State is saved to JSON so a normal process restart keeps the current round when storage is persistent.

## Railway deployment

1. Upload this project to GitHub, then create a new Railway project from the repo.
2. Railway will run `npm start` automatically.
3. Optional but recommended environment variable:
   - `ADMIN_PIN=your-private-pin`
4. For persistence across Railway redeploys, attach a Railway Volume and mount it at `/data`, then add:
   - `DATA_DIR=/data`
5. Open your Railway public URL for the admin dashboard.
6. Add `https://YOUR-RAILWAY-DOMAIN/overlay` as an OBS Browser Source.

Suggested OBS Browser Source size: **1000 × 190** (or 1920 × 1080 if you want to position it freely in OBS).

## Round behavior

- **+ PROFIT CALL** adds the entered dollar amount to the pot and gives that caller one ticket.
- Delete a call if you made a mistake; its amount is also subtracted from the pot.
- **Adjust Pot** changes only the pot total and does not create an entry.
- **Roll Winner** picks randomly from all profitable-call entries. More profitable calls = more entries.
- **New Round** clears the pot, entries, call history, and winner.

