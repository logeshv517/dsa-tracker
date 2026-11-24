# DSA Pattern Tracker

A static web app for working through 299 LeetCode problems in 29 patterns, with 3- and 7-day re-solves and 3-line notes per pattern. No build step, no dependencies, no server, no tracking.

## Files

| File | What it does |
|---|---|
| `index.html` | App shell |
| `styles.css` | Layout, light and dark themes |
| `app.js` | Scheduling, views, timer, backup |
| `problems.js` | The 299 problems in study order (edit this to change the list) |

## Run locally

Open `index.html` in a browser. Or serve the folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy (any static host)

**GitHub Pages**

```bash
git init
git add .
git commit -m "DSA pattern tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/dsa-tracker.git
git push -u origin main
```

Then in the repo: Settings → Pages → Deploy from a branch → `main` / root. The site appears at `https://<your-username>.github.io/dsa-tracker/`.

**Netlify**: drag the folder onto https://app.netlify.com/drop

**Vercel**: run `npx vercel` inside the folder.

**Cloudflare Pages**: create a project, upload the folder, no build command.

## How scheduling works

| You log | What happens |
|---|---|
| Attempt 1 solved clean (≤ 25 min, no help) | Cleared |
| Stuck, peeked, or over 25 min | Re-solve in 3 days |
| Clean 3-day re-solve | Final re-solve in 7 days |
| Clean 7-day re-solve | Cleared |
| A miss at any step | Back to the 3-day re-solve |

All four numbers (25, 3, 7, and new problems per day) are editable in Settings. "Core first" makes the Today queue pick ★ problems before the rest.

## Your data

- Progress is saved in your browser's `localStorage`, per browser and per device.
- Use Settings → Export backup to download a `.json` file, and Import backup to restore it (or move to another device).
- Clearing site data in the browser deletes progress, so export now and then.

## Changing the problem list

Each row in `problems.js` is:

```js
[number, 'LeetCode title', flags, 'optional hint']
// flags: '*' core, 'H' hard, '*H' both, '' plain medium
```

Keep numbers unique. Progress is keyed by number, so renumbering existing problems moves their history.
