# DSA tracker

A simple static web app for 299 LeetCode problems grouped into 29 patterns.

- Tick a problem when it's solved. Every row shows **Medium** or **Hard**.
- Each problem has its LeetCode link, plus as many study links as you want (YouTube, GFG, articles, your own docs).
- Each pattern has one notes box that saves as you type.
- Search across all problems from the top bar (by name, number like `#42`, or pattern).

No build step, no dependencies, no tracking.

## Files

| File | What it does |
|---|---|
| `index.html` | App shell and dialogs |
| `styles.css` | Layout, light and dark themes |
| `app.js` | Ticks, links, notes, search, backup |
| `problems.js` | The problem list in study order |

## Update the live site on Render

1. Open your `dsa-tracker` repo on GitHub.
2. Click **Add file → Upload files**.
3. Drag in `index.html`, `styles.css`, `app.js` and `README.md`. They replace the old files with the same names.
4. Click **Commit changes**. Render redeploys within a minute or two.

Your saved progress moves over automatically: anything you logged as solved stays ticked, and old pattern notes are merged into the new notes box.

## Your data

Everything is saved in this browser (`localStorage`). Use the download icon in the top bar to save a backup file or restore one on another device.

## Editing the problem list

Each row in `problems.js` is `[number, 'LeetCode title', flags, 'optional hint']`. Flags: `'*'` core, `'H'` hard, `'*H'` both, `''` medium. Ticks, links and notes are keyed by number, so keep numbers stable.
