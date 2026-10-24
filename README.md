# GroupVerse 🛸

A futuristic group-link directory for **WhatsApp, Telegram, Discord and Signal**.
People search groups, filter by category / country / language, join in one tap,
and can submit their own groups for your review. Ad slots are built in so you
can earn with Google AdSense.

Zero npm dependencies. One Node file. Runs anywhere.

## Run locally

```bash
node server.js
# open http://localhost:3000
```

## Deploy on Railway via GitHub (5 minutes)

1. Put this project in a **new GitHub repository** (upload the files, don't include `data/`).
2. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → pick your repo. Railway detects Node automatically and runs `npm start`.
3. In the service → **Variables**, add:
   - `ADMIN_PASSWORD` — password for your admin panel (**required, pick something strong**)
   - `ADMIN_PATH` — your own secret link to the admin panel. Example: set it to `my-private-room` and your panel lives at `https://your-site.railway.app/my-private-room`. If you skip this it defaults to `/admin`.
   - `SITE_NAME` — your site's name (default: GroupVerse)
   - `ADSENSE_CLIENT` — your AdSense id (`ca-pub-XXXXXXXXXXXXXXXX`) once you have one
4. **Settings → Networking → Generate Domain** → your live link. 🎉
5. (Optional, recommended) **Settings → Volumes** → mount a volume at `/data`, then set the variable `DATA_DIR=/data`. This keeps all submitted groups safe across redeploys.

## Admin panel

Open your secret admin link (`/admin` by default, or your custom `ADMIN_PATH`), enter your `ADMIN_PASSWORD`.
There you can approve or reject submitted groups, delete anything, clear
reports, and wipe the built-in demo groups with one button.

## Group photos

When someone adds a Telegram or Discord group, the site automatically fetches
the group's picture from the invite link and shows it everywhere the group
appears. WhatsApp keeps group photos private, so the form has an optional
"Group photo link" field — WhatsApp group owners can paste any picture link
and it becomes the group's face on the site.

## Making money

- Create a free [Google AdSense](https://adsense.google.com) account, add your site, wait for approval (usually a few days — sites need real content, so approve some groups first).
- When approved, paste your publisher id into the `ADSENSE_CLIENT` variable in Railway.
- The two built-in ad slots (top + bottom) instantly switch from placeholders to real ads.
- You can add more slots in `public/index.html` and `public/app.js` (search for `ad-slot`).

Tip: more groups + more visitors = more ad revenue. Share your site in the same
communities you already run, and search engines will pick it up over time
(sitemap and robots.txt are built in).

## Tech notes

- Pure Node.js (18+), no dependencies, JSON file storage.
- Submissions are validated (only real invite-link hosts accepted), rate-limited per IP, and held for review — this is what keeps spam off your site.
- Report button on every group; groups with reports show a warning in admin.
- Change the name, colors, and tagline freely: `SITE_NAME` env var, `public/style.css`, and the hero text in `public/app.js`.
