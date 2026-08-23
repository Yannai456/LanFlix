# LanFlix

A tiny self-hosted video streaming site for your home network. Point it at a
folder of videos, run it on your server, and open it from any browser on your
LAN.

## Setup

1. Install [Node.js](https://nodejs.org) on your server if it isn't already there.
2. Copy this folder to your server.
3. Install the one dependency:
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
account) and start the server with it set:
```
TMDB_API_KEY="your-key-here" VIDEO_DIR="/path/to/your/movies" node server.js
```
Without that variable set, the "search online" button simply doesn't
appear — manual upload still works exactly the same either way.

Thumbnails are stored in a `.homeflix-thumbnails` folder inside your video
directory, alongside the existing `.homeflix-tags.json` file, so they
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
`homeflix` behaves like any other audio app: it keeps playing when your
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
Categories are stored in a small `.homeflix-tags.json` file that lives
inside your `VIDEO_DIR`, so they stay with the folder if you move it.

## Controller navigation (Steam Deck, Xbox/PlayStation controllers, etc.)

Any standard browser-recognized gamepad works — on Steam Deck this works in
both Gaming Mode's built-in browser and Desktop Mode (Chrome/Firefox). Once
a controller is detected, an indicator appears in the corner:

- **D-pad / left stick** — move around the video grid
- **A** — open the highlighted video
- **B** — close the player (or cancel the tag editor)
- **Left/right bumper** — cycle through category filters
- While a video is playing: **A** play/pause, **left/right** seek ±10s,
  **up/down** volume

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
pm2 start server.js --name homeflix -- --VIDEO_DIR="/path/to/your/movies"
pm2 save
pm2 startup   # follow the printed instructions to auto-start on boot
```
Or set it up as a systemd service if your server runs Linux.

## Notes

- This has **no login/authentication** — anyone on your home network (or
  anyone who can reach that IP/port) can access it. Fine for a trusted home
  LAN; don't port-forward it to the public internet without adding auth first.
- Seeking/scrubbing works because the server responds to HTTP range requests.
