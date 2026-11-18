# Vice After Dark — Studio v1.1.0

This guide covers optional Twitch integration, OBS scene synchronization, animated transitions, drag-and-resize layouts, presets, and configuration backup/restore. All settings stay on your own Docker deployment. The application runs with **Node.js 22** and no external npm runtime dependencies.

## Update the installation

On your Docker host:

```bash
cd /opt/gta-overlay
git pull
docker compose up -d --build
```

The dashboard is `http://YOUR-DOCKER-IP:18787/admin`. If you use Dockhand, update the stack from the current repository commit and rebuild the image, retaining the `vice-overlay-data` Docker volume.

## New OBS Browser Sources

| Browser Source URL | Purpose | Background |
|---|---|---|
| `/overlay/auto` | Automatically shows gameplay/starting/BRB/ending layouts based on the currently selected OBS program scene | Depends on scene |
| `/overlay/transition` | Plays a short neon wipe/red wipe/fade after the OBS scene changes | Transparent while idle |
| `/overlay/twitch-alerts` | Shows follower/subscription/raid/Bits notifications | Transparent while idle |

Set Browser Source width **1920**, height **1080** for each. Add the transition and Twitch alert sources to every OBS scene where you want them, ideally by adding a *reference* to the same Browser Source in OBS so it does not recreate the page on every scene switch. Avoid selecting **Shutdown source when not visible** if you want it to maintain the EventSource connection. These are browser graphics, **not an OBS-native transition or a tool that changes OBS scenes**.

## Set up OBS synchronization

1. In **OBS Studio → Tools → WebSocket Server Settings**, enable the WebSocket server and configure a strong password. OBS 28+ normally includes obs-websocket 5; its default port is **4455**.
2. Confirm that your Docker LXC can reach the **OBS computer's** LAN address and port 4455. `127.0.0.1` from within Docker is **not** your Mac/PC running OBS.
3. Create a local `.env` file alongside `compose.yaml`, or set matching Compose variables in Dockhand:

```dotenv
OBS_WS_URL=ws://YOUR-OBS-COMPUTER-LAN-IP:4455
OBS_WS_PASSWORD=YOUR_OBS_WEBSOCKET_PASSWORD
```

4. Rebuild/redeploy, unlock dashboard editing, and inspect **Twitch, OBS & Transitions → OBS WEBSOCKET 5**. It displays the connected program scene and detected scene names.
5. Optionally assign an overlay mode to each OBS scene in **OBS Scene Mappings**. By default, scenes containing `starting`, `soon`, or `intro` show Starting Soon; `brb` or `break` show BRB; `ending`, `offline`, or `outro` show Ending; everything else shows Gameplay. Pick **Hide Overlay** to suppress the Auto Overlay for a scene.
6. Add `/overlay/auto` to the scenes where you want that effect. For best results, use an OBS Browser Source reference and avoid layering it over another full-screen overlay.

The overlay service only listens to OBS WebSocket events; it **does not send scene switching or source editing commands** to OBS. Keep OBS port 4455 inside your private LAN/VPN. To connect across an untrusted network, use `wss://` or a secure tunnel.

## Set up Twitch

1. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), register a **confidential** application. Add the exact redirect URL for the host you use to access the dashboard. Example:

```text
https://overlays.example.com/api/integrations/twitch-callback
```

2. Configure a secure HTTPS route to the overlay app (for example using Pangolin) and protect your admin dashboard. Twitch generally requires HTTPS redirect URLs except localhost development; a raw LAN IP with HTTP may not be accepted.
3. Set the following **locally** in `.env` or your Docker secret/environment configuration (not in GitHub):

```dotenv
TWITCH_CLIENT_ID=YOUR_TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET=YOUR_TWITCH_CLIENT_SECRET
TWITCH_REDIRECT_URI=https://overlays.example.com/api/integrations/twitch-callback
```

4. Restart the container. Visit the dashboard via the registered hostname, **Unlock Editing**, and click **Connect Twitch**. Approve the permissions for the broadcaster's Twitch account.
5. The dashboard will display connection state, successful event subscriptions or a failure message. Add `/overlay/twitch-alerts` to OBS and use **Test Alert** to preview the animation.

The server requests the least scopes used for these alerts: `moderator:read:followers`, `channel:read:subscriptions`, and `bits:read` (raids need no extra scope). Twitch's official **EventSub WebSocket** delivers the notifications via an outbound connection, so no public Twitch webhook endpoint is required. Twitch tokens are stored in `/app/data/twitch-oauth.json` with file mode `0600`, refreshed when approaching expiry, and intentionally omitted from configuration backups. **Disconnect Twitch** removes the saved OAuth credentials locally.

## Animated scene transitions

Choose **Vice Neon Streak**, **Red Wipe**, or **Soft Fade**, select a duration from **300 to 3000 ms**, and save integration options. Use **Test Transition** to preview the graphic. Scene changes from OBS trigger the overlay effect via the SSE connection. The browser effect overlays the new scene; it is not a native OBS stinger with a configurable cut point.

## Drag-and-resize editor

1. Open **Visual Layout Editor** on the dashboard and pick a scene.
2. Grab a labeled widget box to move it; drag the small square in its lower-right corner to resize it. Coordinates snap to 10-pixel increments; you can also edit X, Y, Width and Height numerically.
3. Click **Save Layout**. Saved positions are stored in the persistent settings JSON and broadcast to all connected overlays immediately.
4. Click **Reset Scene** to return the scene's existing widgets to their default positions.

Available widgets include the gameplay header/footer, full-screen headings and footer, countdown, Weazel News ticker, webcam frame, announcement, socials, and Twitch alert card. This is an editor for existing widgets, not a general HTML page builder. Each scene has an independent layout. The Auto Overlay follows its current rendered scene's layout.

## Presets

Under **Presets, Backup & Restore**, enter a name and **Save Preset**. Up to **20** named snapshots are kept in the persistent Docker volume as `/app/data/presets.json`. You can apply or delete any saved preset. A preset includes the current overlay settings, widget coordinates and OBS mapping configurations, but not Twitch tokens.

## Backup and restore

Choose **Download Backup JSON** to save a file containing:

- Overlay settings, all per-scene widget layouts, and OBS scene mappings
- Saved named presets
- Custom uploaded background and logo images (base64 in the JSON)

Choose **Restore Configuration**, select a prior backup, and confirm replacing the current settings and images. The server validates its schema, widget bounds, supported fields and image formats before applying changes. Built-in images ship with the code and are not embedded into backups. OAuth tokens, Twitch client secrets, OBS WebSocket passwords and Docker environment variables are deliberately **excluded**.

Because this JSON contains your account handles, settings and any uploaded artwork, store it securely. Keep the Docker volume intact during rebuilds.

## Security and testing

All state-changing endpoints require the existing dashboard Basic authorization and same-origin check. Only OBS/Twitch credentials entered in local Docker settings are used; **never commit a populated `.env` file**. HTTP Basic credentials need HTTPS outside a trusted LAN. Use a strong administrator password.

Run `npm test` in the cloned project for server/API smoke tests and confirmation that no parody headlines remain. Test real OBS scene switches and Twitch EventSub notifications after configuring your equipment—those network connections cannot be verified from a GitHub commit alone.

Official integration references: [Twitch EventSub](https://dev.twitch.tv/docs/eventsub), [Twitch OAuth](https://dev.twitch.tv/docs/authentication), and [obs-websocket 5](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md).
