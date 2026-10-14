# Conacrew Logistics

Phone app for the fleet, sugarcane and passion fruit businesses. Static pages plus three Netlify Functions.

## How it deploys
Netlify is linked to this repo. Every push to `main` deploys the app **and** the functions.
(Drag-and-drop zip deploys do not include functions, so office sync and live GPS stop working with them.)

## Files
- `index.html`, `app.html`, `app.js`, `store.js`, `styles.css`, `sw.js`: the app (bump `?v=` and the `CACHE` name in `sw.js` on every release)
- `netlify/functions/sync.mjs`: sign-in and the office book (each phone sends only what changed; merged record by record)
- `netlify/functions/live.mjs`: last GPS position per truck, plus a short trail
- `netlify/functions/media.mjs`: photos, voice notes and documents
- `netlify/shared/core.mjs`: the server logic used by all three

Data is kept in Netlify Blobs (store `conacrew`). Optional: set `CONACREW_SECRET` in Netlify environment variables; otherwise a secret is created automatically.
