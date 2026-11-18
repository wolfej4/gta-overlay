# Vice After Dark — OBS overlay suite

A **self-hosted**, GTA VI / Vice City-inspired, animated browser-source overlay pack built for **ArcadeTimeTV**. All artwork and branding are original fan-created visuals; no Rockstar assets or logos are included.

## Overlays

| Scene | OBS URL | Background |
|---|---|---|
| Minimal gameplay | `/overlay/gameplay` | Transparent |
| Dispatch / six-star widget | `/overlay/dispatch` | Transparent |
| Webcam frame | `/overlay/cam` | Transparent |
| Manual announcement | `/overlay/alert` | Transparent |
| Starting Soon + countdown | `/overlay/starting` | Full-screen |
| Be Right Back | `/overlay/brb` | Full-screen |
| Stream Ending | `/overlay/ending` | Full-screen |

The dispatch stars, location, and mission are **manually controlled** from the dashboard. They are **not connected to GTA VI's internal data**. Live gameplay telemetry is **not claimed**. The cam overlay is just a decorative, transparent frame; add your actual webcam as a separate OBS source behind it. The gameplay design stays away from the HUD as much as possible.

## Deploy using Dockhand or Docker Compose

1. Extract this folder onto your Docker host (for example `/opt/vice-after-dark`).
2. Edit `compose.yaml`: **replace `SET_A_LONG_RANDOM_PASSWORD` with a strong unique password**, at least 12 characters. The app refuses to start without one.
3. In Dockhand, create a new stack using the `compose.yaml` and provide the project directory as build context (or on the CLI run `docker compose up -d --build` inside the folder). This Compose file uses `build: .`, so the entire project directory is needed, not only the YAML contents. If your Dockhand installation doesn't support local build contexts in the stack UI, run the CLI build on that host and then deploy the image through Dockhand.
4. Open `http://YOUR-DOCKER-IP:8787/admin` to see the control panel.
5. Click **Unlock Editing** and enter your password. Change the theme, labels, six-star meter, and countdown. Press **Save & Broadcast**. Connected overlays update immediately via Server-Sent Events.

### OBS setup

1. In OBS, add **Sources → + → Browser**.
2. Set the source URL to `http://YOUR-DOCKER-IP:8787/overlay/gameplay`.
3. Set width **1920**, height **1080**, and place it **above** your gameplay capture.
4. Add additional Browser sources for `/overlay/dispatch` or `/overlay/cam` only when needed.
5. For Starting Soon / BRB / Ending, create separate OBS scenes and use their respective URLs.
6. For the camera, add your **Video Capture Device** underneath the `/overlay/cam` source, position the video inside the empty center of the frame, and resize as needed. The default frame sits at approximately x=1450–1900, y=394–674 on a 1920×1080 canvas; you can change it to center-left from the dashboard.

### URL examples

- Dashboard: `http://192.168.0.41:8787/admin` (replace IP with actual Docker host)
- Gameplay: `http://192.168.0.41:8787/overlay/gameplay`
- Dispatch: `http://192.168.0.41:8787/overlay/dispatch`
- Camera: `http://192.168.0.41:8787/overlay/cam`
- Starting: `http://192.168.0.41:8787/overlay/starting`

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
