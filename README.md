# Vice After Dark — OBS overlay suite

A **self-hosted**, GTA VI / Vice City-inspired, animated browser-source overlay pack built for **ArcadeTimeTV**. All artwork and branding are original fan-created visuals; no Rockstar assets or logos are included.

## Versioning

The app version is stored in **`package.json`** (now **v1.2.0**) and displayed on the dashboard sidebar. The server also provides `GET /api/version`, which returns the installed version. For ordinary feature/fix updates pushed to `main`, the GitHub Actions workflow `.github/workflows/auto-version.yml` automatically increases the **patch** component (for example, `1.0.1` → `1.0.2`) and commits the new version back to `main`. Each push to `main` creates one patch release; a batch of edits in one push is treated as one update. Its own version-bump commits use `[skip version]` so the workflow cannot loop.

This automation requires **GitHub Actions enabled** and a workflow token allowed to write repository contents (Settings → Actions → General → Workflow permissions). If an Actions workflow fails, the version will remain unchanged until the permission or failure is resolved. For intentional breaking releases, bump the major or minor component manually and include `[skip version]` in the commit message to keep the chosen number.

After a version update, redeploy with `git pull && docker compose up -d --build` to display the new version locally. The dashboard shows the version actually running inside your Docker container, not the most recent version on GitHub.

## Social handles and custom branding

In **Where to find you**, fill in the handles you want to display for Twitch, YouTube, TikTok, Instagram, X, Discord, Facebook, Kick, Bluesky, Threads and Reddit. Each social has a locally hosted icon. **Blank handles hide that social and its icon.** Existing single-handle installations are migrated into Twitch; clear the Twitch field if you don't want it.

Starting with **v1.0.4**, the uploaded sunset-and-palm-tree image is included in the repository at `public/assets/default-background.webp` as the built-in default background. Starting Soon, BRB, and Stream Ending use it automatically after deployment; gameplay remains transparent. The image is a web-optimized copy of the user-provided artwork. No dashboard upload is required to use the default.

In **Background & logo**, you can optionally upload PNG, JPEG or WebP images (up to 8 MB each). A custom background overrides the included wallpaper, and **Remove** returns to the included default. Custom images persist in the existing data volume and update connected OBS browser sources. Logos can still be uploaded separately and are not bundled with the project.

The full-screen footer now displays the editable Channel Name, not a hardcoded ArcadeTimeTV brand. All dropdowns match the height and width of text inputs. The Dispatch/Wanted source and star quick action have been removed. This release is **v1.0.2**.

The top-left channel-name label has been removed from the Starting Soon, BRB, and Stream Ending scenes (v1.0.3). The top-right Vice City pill remains right-aligned, and bottom branding still uses the configurable channel name.

### v1.0.5 — Live status and Vice City copy

- The top-right label now reads **VICE CITY // LIVE** instead of `VICE CITY // 06`. This is a decorative label, not a stream-status integration.
- Starting Soon now says **THE STREETS ARE CALLING**, with a countdown labeled **HITTING THE STREETS IN**.
- BRB says **TAKING A PIT STOP**; Ending says **ANOTHER NIGHT IN VICE CITY**.
- Existing custom starting/BRB/ending subtitle settings remain editable in the dashboard.

## Native OBS stinger — v1.2.0

The Docker build generates a real transparent 1920×1080 VP9/WebM red wipe, 1.6 seconds at 30 fps. OBS itself cuts scenes at the **800 ms** cover point. Download the asset from `/assets/stingers/vice-red-stinger.webm` after rebuilding and configure it in OBS Studio's **Scene Transitions → + → Stinger** with **Transition Point = 800 ms**. The source generator is `scripts/generate-stinger.js`; `npm run build:stinger` can also run locally with FFmpeg installed. The app's previous browser-source transition remains as an optional fallback.

## Studio integration release — v1.1.0

This release adds five optional features: **Twitch EventSub alerts** for follows, subscribers, cheers and raids; **OBS WebSocket 5 scene sync** using `/overlay/auto`; **animated browser-source transitions** using `/overlay/transition`; a **drag-and-resize layout editor**; and **named presets plus complete JSON backup/restore**.

New 1920×1080 Browser Sources:

- `/overlay/auto` — follows the active OBS program scene (starting, BRB, ending or gameplay), respecting configurable scene mappings.
- `/overlay/transition` — animated neon / wipe / fade on OBS scene changes; add a common referenced Browser Source across OBS scenes.
- `/overlay/twitch-alerts` — new follower, subscriber, incoming raid and Bits-cheer alert cards.

All three overlays have transparent backgrounds when idle where appropriate. Existing overlays and the red Weazel News ticker remain available. Scene sync **reads the OBS program scene**, it does not switch scenes in OBS. Animated overlays are not native OBS stinger transitions.

**Configuration:** copy `.env.example` to an untracked `.env` file, set OBS WebSocket and Twitch credentials, then rebuild the Docker service. OAuth credentials remain on your Docker host. Twitch needs an OAuth application with the exact redirect URI ending `/api/integrations/twitch-callback` and, outside localhost development, an HTTPS URL. Use the dashboard to authorize Twitch, see OBS connection status, map OBS scenes, test alerts/transitions, edit positions, and save presets or backup files.

**Full setup guide:** [`docs/STUDIO.md`](docs/STUDIO.md). Run `npm test` for basic server/API verification. These integrations require actual OBS and Twitch accounts/devices for live end-to-end testing.

## Weazel News ticker — v1.1.2

The red, full-width **WEAZEL NEWS** browser source at `/overlay/ticker` now contains **161 local-news bulletins**: 121 from Vice City and the rest of Leonida, plus 40 from older GTA locations including Los Santos, Blaine County, Liberty City, San Fierro, and Las Venturas. The old plot-and-character news items, including all mentions of Jason and Lucia, were removed.

**Fictional newsroom simulation, not real or officially confirmed events.** The reports cover traffic, crime, emergency response, weather, tourism, nightlife, boating and civic issues in GTA's fictional world. The headlines are invented for stream atmosphere rather than taken from Rockstar's narrative or an external news service. They are written as straight-faced local reports, without joke/parody headlines.

**Randomized, non-repeating rotation:** the ticker shuffles the selected headline pool on load, displays each story exactly once per round, then reshuffles for the next round. A story cannot appear twice in a single round or repeat immediately across rounds (when at least two stories are available). The virtualized queue supports indefinite scrolling without a blank gap. The ticker keeps its full-width red design, scroll-speed slider, enable controls and optional custom headlines. Dashboard category filters: All local reports, Vice City & Leonida, and Other GTA cities. Custom headlines join the shuffle; entries containing the names Jason or Lucia are excluded from display, but retained in saved settings.


## Overlays

| Scene | OBS URL | Background |
|---|---|---|
| Minimal gameplay | `/overlay/gameplay` | Transparent |
| Social accounts and icons | `/overlay/socials` | Transparent |
| Vice City Wire news ticker | `/overlay/ticker` | Transparent |
| Webcam frame | `/overlay/cam` | Transparent |
| Manual announcement | `/overlay/alert` | Transparent |
| Starting Soon + countdown | `/overlay/starting` | Full-screen |
| Be Right Back | `/overlay/brb` | Full-screen |
| Stream Ending | `/overlay/ending` | Full-screen |

The Dispatch/Wanted widget and quick-action stars have been removed. The cam overlay is a decorative, transparent frame; add your webcam as a separate OBS source behind it. The gameplay design stays away from the HUD as much as possible.

## Deploy using Dockhand or Docker Compose

1. Extract this folder onto your Docker host (for example `/opt/vice-after-dark`).
2. Edit `compose.yaml`: **replace `SET_A_LONG_RANDOM_PASSWORD` with a strong unique password**, at least 12 characters. The app refuses to start without one.
3. In Dockhand, create a new stack using the `compose.yaml` and provide the project directory as build context (or on the CLI run `docker compose up -d --build` inside the folder). This Compose file uses `build: .`, so the entire project directory is needed, not only the YAML contents. If your Dockhand installation doesn't support local build contexts in the stack UI, run the CLI build on that host and then deploy the image through Dockhand.
4. Open `http://YOUR-DOCKER-IP:18787/admin` to see the control panel.
5. Click **Unlock Editing** and enter your password. Change the theme, labels, six-star meter, and countdown. Press **Save & Broadcast**. Connected overlays update immediately via Server-Sent Events.
6. The **OBS URL for the selected scene** appears directly under its live preview. Click the URL to select it and copy it with **Ctrl+C** (Windows) or **⌘C** (Mac), or use the **Copy OBS URL** button. All seven OBS URLs are also displayed in full under **Browser Source URLs**; you can select or copy each one individually. If your browser blocks clipboard access over HTTP, clicking the URL still lets you select and copy it manually.


### Host port (default: 18787)

The Docker container still listens on port **8787 internally**, but Docker publishes it on **18787** on your host. To use a different host port, set `OVERLAY_HOST_PORT` in a `.env` file next to `compose.yaml`, for example:

```dotenv
OVERLAY_HOST_PORT=18888
```

Then restart with `docker compose up -d`. Use the chosen host port in your OBS browser-source URLs. You do not need to change `PORT`, `Dockerfile`, or the container's internal port mapping.

To check whether **18787** appears to be in use on your Docker host before deploying, run `sudo ss -ltn | grep ':18787 '` and `docker ps --format '{{.Names}} {{.Ports}}' | grep 18787`. No output is a good sign, but only Docker can definitively confirm whether it can bind the port.

### OBS setup

1. In OBS, add **Sources → + → Browser**.
2. Set the source URL to `http://YOUR-DOCKER-IP:18787/overlay/gameplay`.
3. Set width **1920**, height **1080**, and place it **above** your gameplay capture.
4. Add additional Browser sources for `/overlay/socials` or `/overlay/cam` only when needed.
5. For Starting Soon / BRB / Ending, create separate OBS scenes and use their respective URLs.
6. For the camera, add your **Video Capture Device** underneath the `/overlay/cam` source, position the video inside the empty center of the frame, and resize as needed. The default frame sits at approximately x=1450–1900, y=394–674 on a 1920×1080 canvas; you can change it to center-left from the dashboard.

### URL examples

- Dashboard: `http://192.168.0.41:18787/admin` (replace IP with actual Docker host)
- Gameplay: `http://192.168.0.41:18787/overlay/gameplay`
- Socials: `http://192.168.0.41:18787/overlay/socials`
- Ticker: `http://192.168.0.41:18787/overlay/ticker`
- Camera: `http://192.168.0.41:18787/overlay/cam`
- Starting: `http://192.168.0.41:18787/overlay/starting`

## Security and architecture

- Zero npm dependencies; standard Node.js HTTP server.
- Settings stored in a Docker volume at `/app/data/settings.json`, updated atomically.
- Reading overlays is intentionally unauthenticated (OBS must access them); editing requires `admin` + `ADMIN_PASSWORD` over HTTP Basic auth.
- **Use only on a trusted LAN or behind HTTPS and access control** if making it accessible over the internet. HTTP Basic credentials are readable in plaintext over unencrypted connections.
- If using Pangolin, protect `/admin` and `/api/settings` writes. Overlay source pages and `/api/events` must remain reachable by your authorized OBS clients.
- The server has an `/api/health` endpoint. No analytics or outbound requests.
- The animated full-screen scenes are original CSS + SVG vector backgrounds and don't require internet.
- To customize actual layouts, edit `public/overlay.css` and `public/overlay.js`, then rebuild.

## Files

- `server.js`: HTTP server, Basic auth, settings API, and live SSE updates.
- `public/overlay.html`, `overlay.js`, `overlay.css`: render the OBS scenes.
- `public/admin.html`, `admin.js`, `admin.css`: dashboard UI and editor.
- `public/assets/`: original vector background artwork.
- `compose.yaml`, `Dockerfile`: self-hosted Docker build.

## Testing without Docker

```bash
ADMIN_PASSWORD='your-unique-password-over-12-characters' npm start
```

Open <http://localhost:8787/admin>. Default port: 8787. Node 20+ required.

## Rights

This is an unofficial GTA VI-inspired fan overlay and is **not affiliated with or endorsed by Rockstar Games**. Do not imply official affiliation, and do not include copyrighted GTA VI art without the necessary permissions.
