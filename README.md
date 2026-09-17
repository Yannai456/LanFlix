# Lan flix

A tiny self-hosted video streaming site for your home network. Point it at a
folder of videos, run it on your server, and open it from any browser on your
LAN.

## Setup

1. Install [Node.js](https://nodejs.org) on your server if it isn't already there.
2. Copy this folder to your server.
3. Install dependencies:
   ```
   npm install
   ```
4. Run it, pointing at your movies folder:
   ```
   VIDEO_DIR="/path/to/your/movies" node server.js
   ```
   (On Windows: `set VIDEO_DIR=C:\path\to\movies && node server.js`)

   If you skip `VIDEO_DIR`, it defaults to a `videos` folder next to `server.js`.

5. Find your server's LAN IP (e.g. `192.168.1.50`) — on Linux/macOS run `ip a`
   or `ifconfig`; on Windows run `ipconfig`.

6. From any device on your home network, open a browser and go to:
   ```
   http://192.168.1.50:8000
   ```

## Music player with animated bars

Any `.mp3` (or `.wav`/`.flac`/`.m4a`/`.ogg`/`.aac`) file, and any video or
audio file tagged with a category literally called `music` (any
capitalization — `Music`, `MUSIC`, etc. all count), opens in a different
player: a pulsing circular "album art" placeholder with an animated
frequency-bar visualizer underneath, instead of the normal video player.
This uses the browser's Web Audio API to analyze the audio in real time —
no extra setup needed, it just works once the file is playing.

To make an existing video (say, a concert recording) open this way, edit
its tags and add `music` as one of them. Plain `.mp3` files get the bar
player automatically, tag or not.

## Thumbnails

Click "🏷 edit" on any card to open the thumbnail editor. You can:

- **Upload an image** from your device — this always works, no setup
  needed. JPG, PNG, WebP, or GIF, up to 10MB.
- **Remove** a thumbnail to go back to the plain gradient placeholder.
- **Search online for a poster** — only appears if the server has an
  optional TMDB (The Movie Database) API key configured. If it's set,
  clicking this searches TMDB by the video's name and shows a strip of
  matching posters; click one to use it. The image is downloaded and saved
  on your server, so once picked, it works fully offline like any other
  thumbnail.

To enable poster search, get a free API key from
[themoviedb.org](https://www.themoviedb.org/settings/api) (requires a free
account), then paste it into Settings → Poster search. No restart needed —
it's saved on the server and takes effect immediately. (If you prefer, you
can still set a `TMDB_API_KEY` environment variable when starting the
server instead; a key entered in Settings takes priority if both are set.)
Without a key configured either way, the "search online" button simply
doesn't appear — manual upload still works exactly the same regardless.

Thumbnails are stored in a `.Lan flix-thumbnails` folder inside your video
directory, alongside the existing `.Lan flix-tags.json` file, so they
travel with your library if you move it.

## Renaming a video

Click "🏷 edit" on any card — the same modal used for categories now has a
**File name** field at the top, pre-filled with the current name (the
extension is fixed and shown next to it, so you can't accidentally change
a video to a `.mkv` that's actually still an mp4). Change it and hit Save;
the file itself is renamed on disk, and any categories it belonged to move
with it automatically.

## Settings and themes

Click the ⚙ icon in the header to open Settings. Eleven color themes are
built in: **Ocean** (teal/blue), **Sunset** (pink/purple), **Grape**
(violet/fuchsia), **Ember** (orange/red), **Forest** (green), **Rose**
(crimson), **Gold** (amber), **Midnight** (indigo), **Cyber** (magenta/cyan),
**Light**, and **Sand** (a warm light mode). Your choice is saved in the
browser (`localStorage`), so it's per-device. The music player's bar
visualizer also follows whichever theme is active, using that theme's own
colors for the bars.

## Background play (music)

Also in Settings: a toggle for **Background play**. Normally, mobile
browsers will cut audio when you lock the screen or switch apps if the page
has rerouted the sound through a Web Audio API connection — which is
exactly what the bar visualizer does to analyze the music in real time.
Turning Background play on skips that rerouting entirely for music, so
`Lan flix` behaves like any other audio app: it keeps playing when your
screen locks or you switch apps, with lock-screen play/pause controls
(via the Media Session API, on browsers that support it). The tradeoff is
the animated bars won't show while this is on — a small badge tells you
why.

Off by default, since the visualizer is a fun default. One quirk: once a
song has played with the visualizer active in a browser tab, that
connection sticks around for the rest of that tab's session. If you enable
Background Play after already listening to something with bars showing,
reload the page once so it takes full effect.

## Mobile

Tiles are smaller and denser on narrow screens (under 640px wide) so more
fit per row and it's quicker to scroll/swipe through a big library on a
phone.

## Cache nodes (LAN caching, optional)

For a larger house, you can run small "cache node" helper servers on other
machines around the house (a laptop, a Raspberry Pi, an old PC) so videos
get served from something physically closer to where they're being
watched, instead of always crossing the whole house back to the main
server. This is genuinely most useful when part of your network has weak
WiFi backhaul (like a mesh extender) — a cache node on that same segment
means devices there only cross the weak link once, not twice.

**How it works, end to end:**

1. The main server advertises itself on the LAN via **mDNS** (the same
   protocol behind AirPlay/Chromecast/network-printer discovery) — no
   manual IP configuration needed on the cache node's side.
2. When you start `cache-node.js` on another machine, it listens for that
   mDNS announcement, finds the main server automatically, and registers
   itself back with it using a shared pairing secret (printed in the main
   server's terminal output on startup — you'll need to copy that value).
3. The main server keeps a live list of registered cache nodes (with a
   heartbeat — nodes that go quiet for 45 seconds drop off the list
   automatically) and exposes it at `/api/cache-nodes`.
4. When you load the library in your browser, it fetches that list and
   does a quick health-check race against each node to find the
   fastest-responding one for your current location on the network.
5. Playback for eligible videos routes through that node instead of the
   main server. The node uses a **pull-through cache**: the first request
   for a file fetches it from the main server and saves a local copy;
   every request after that is served entirely locally, no trip back to
   the main server at all.
6. Cache nodes use **LRU eviction** — when local storage fills up (default
   cap 20GB, configurable), the least-recently-watched cached file is
   deleted first to make room.
7. Cache nodes periodically check a "library version" number on the main
   server. If anything changes there (a video renamed, deleted, or a
   folder made private), the version changes and any now-stale cached
   copies are deleted automatically — this is the cache invalidation piece.

**Private folders are never cached**, on purpose: the main server's
cache-facing endpoints refuse to hand over anything tagged with a private
category, regardless of whether you've currently unlocked it in your own
session. Cache nodes have no concept of your passcode/unlock tokens at
all, so private videos always stream directly from the main server only.

**To run a cache node**, on another machine on the same network:
```
git clone (or copy) this project to that machine
npm install
CACHE_SECRET="paste-the-secret-from-the-main-server's-startup-log" node cache-node.js
```
Optional environment variables:
- `CACHE_PORT` — defaults to 8100
- `CACHE_DIR` — where cached files are stored, defaults to `cache-storage/` next to `cache-node.js`
- `CACHE_MAX_MB` — cache size cap in megabytes, defaults to 20000 (20GB)
- `MAIN_SERVER_URL` — set this to skip mDNS discovery and connect directly, e.g. if mDNS is blocked on your network/VLAN

You can run more than one cache node (one per floor or problem area). See
Settings → Cache nodes to check which ones are currently discovered and
which one is actively being used.

**Being honest about when this actually helps:** if your slowdown is
really a WiFi coverage problem in one room, a cache node sitting in that
same room still has to cross that same weak WiFi link to reach a device
there — caching doesn't fix a weak radio link, better AP placement or
wired backhaul does. This is most useful when the *main server itself* is
the bottleneck (e.g. multiple people streaming simultaneously maxing out
its disk or network), or specifically when a room's WiFi is a repeated
extender hop where local caching avoids crossing that hop twice.

## Loading performance

A few things happen under the hood to make playback start faster and repeat
plays snappier:

- **Conditional requests (ETag / Last-Modified):** if the browser already
  has a video cached, it sends a quick "has this changed?" check instead of
  re-downloading anything — the server replies with a tiny `304 Not
  Modified` when nothing's changed.
- **Larger streaming buffer:** the server reads video files in 1MB chunks
  instead of Node's 64KB default, which helps throughput, especially over
  Wi-Fi or if your video folder is on a spinning hard drive.
- **Cache headers on the app itself:** the page/JS revalidate instantly on
  reload instead of doing a full re-fetch when nothing changed.
- **A loading spinner** appears while a video or song is buffering, so it's
  clear something's happening instead of a blank screen.

None of this speeds up actual video *decoding* — if playback stutters once
it's already started (as opposed to just being slow to begin), that's
usually the device's hardware struggling with the video's resolution/codec,
which is a different problem (re-encoding the file to a lighter format, or
enabling hardware decoding, would be the fix there).

## Removing a video

Every card has a small ✕ button in the top-right corner. Click it, confirm,
and the file is deleted from disk on the server (and removed from any
categories it was in). This can't be undone.

## Adding a video to an existing folder/category

Click the small **+** button next to any category chip. This puts the whole
library into "assign mode" — a banner appears at the top, and clicking any
card toggles it in or out of that category (a checkmark shows which videos
are already in it). Click **DONE** when you're finished. This is the fast
way to sort a bunch of videos into a folder without typing tags one by one.

## Searching and categories

Type in the search bar to filter by title. Click a category chip to filter
the grid to just that category — click it again (or click "All") to clear
it. A video can belong to **multiple categories at once**: click "🏷 edit" on
any card and type comma-separated categories (e.g. `comedy, 90s, favorites`).
Categories are stored in a small `.Lan flix-tags.json` file that lives
inside your `VIDEO_DIR`, so they stay with the folder if you move it.

## Controller navigation (Steam Deck, Xbox/PlayStation controllers, etc.)

Any standard browser-recognized gamepad works — on Steam Deck this works in
both Gaming Mode's built-in browser and Desktop Mode (Chrome/Firefox). Once
a controller is detected, an indicator appears in the corner. Controller
navigation now covers the whole app, not just the grid:

- **D-pad / left stick** — move around the video grid, or step through
  fields inside any open menu (Settings, the edit modal, unlock/privacy
  prompts)
- **Confirm** (A by default) — open the highlighted video, or activate
  whatever's focused in a menu
- **Back** (B by default) — close the player, close whichever menu is open,
  or cancel assign mode
- **Previous/Next category** (LB/RB by default) — cycle category filters
- **Open Settings** (Start by default) — jump straight into Settings from
  the grid
- **Jump to search** (Y by default) — focus the search bar
- While a video is playing: confirm play/pause, left/right seek ±10s,
  up/down volume

All of these buttons are remappable: Settings → Controller, click **Remap**
next to any action, then press whatever button you want on your controller.
D-pad/stick direction itself is fixed (it's the natural navigation axis),
but everything else — confirm, back, category cycling, opening Settings,
jumping to search — can be reassigned to match your controller's layout.
The mapping is saved per-device.

## Desktop app

Settings → Desktop app has three download buttons: Linux, Windows, macOS.
Each downloads a zip (`linux.zip`, `windows.zip`, `mac.zip`) from a
`/downloads` folder the server serves statically. Inside each zip is a
small launcher script — a `.desktop` file, a `.bat` file, or a `.command`
file — plus a README with setup steps, that opens Lan flix in its own
window using a browser already on that device, with no address bar or
tabs. These aren't installers or compiled binaries; they're lightweight
wrapper scripts, which means there's nothing to keep updated when the app
itself changes.

The server generates these zip files itself into a `downloads/` folder
(next to `server.js`) every time it starts, auto-detecting its own LAN IP
address and baking that into the launcher scripts. If your server's IP
ever changes (e.g. a new DHCP lease), just restart the server once and the
downloads regenerate with the new address.

## Private folders

Any category can be turned into a passcode-protected private folder. Click
the small lock icon next to a category chip:

- **Not private yet** → set a passcode (4+ characters) to make it private.
  Every video in that category is immediately hidden from the grid, the
  category list, and even direct links — the server itself won't serve
  those files without a valid unlock, this isn't just hiding things in the
  browser.
- **Already private** → the same lock icon lets you change the passcode or
  remove protection entirely, both of which require the current passcode.

Clicking a locked category's chip prompts for the passcode. Once unlocked,
it stays unlocked for that browser tab's session (stored in
`sessionStorage`) — closing the tab re-locks it, so it doesn't silently
stay open. Passcodes are stored as salted hashes (`scrypt`), never in plain
text, in `.Lan flix-private.json` inside your video folder.

Worth being honest about the security model: this is meant to keep casual
household members from stumbling into something, not to withstand a
determined attacker with access to your server's filesystem or a
network-traffic capture on an unencrypted `http://` LAN connection. For
genuinely sensitive material, that's a different threat model than this
feature is built for.

## Adding videos through the browser

Click **+ ADD VIDEO** in the header to pick file(s), or just drag video
files anywhere onto the page and drop them. Uploaded files are saved
straight into `VIDEO_DIR` on the server, and the library refreshes
automatically once the upload finishes.

By default uploads are capped at 20 GB per file — change the `limits.fileSize`
value in `server.js` if you need more.

## Supported formats

Video: `.mp4`, `.webm`, `.mkv`, `.mov`, `.m4v`.
Audio: `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`, `.aac`.

Note: browsers natively play MP4 (H.264) and WebM well. MKV files will
often download/play depending on the codec inside — if a file won't play,
it likely needs converting to MP4 first (e.g. with `ffmpeg`).

## Running it permanently

Right now the server stops if you close the terminal. To keep it running in
the background, use a process manager like `pm2`:
```
npm install -g pm2
pm2 start server.js --name Lan flix -- --VIDEO_DIR="/path/to/your/movies"
pm2 save
pm2 startup   # follow the printed instructions to auto-start on boot
```
Or set it up as a systemd service if your server runs Linux.

## Notes

- This has **no login/authentication** — anyone on your home network (or
  anyone who can reach that IP/port) can access it. Fine for a trusted home
  LAN; don't port-forward it to the public internet without adding auth first.
- Seeking/scrubbing works because the server responds to HTTP range requests.
