# iPhone PWA

## Access

The Nexus AI Open WebUI instance is available at:

`http://198.51.100.10:3000`

The address is reached over Tailscale.

## Installation

On iPhone:

1. Open the Nexus URL in Safari.
2. Let the page fully load.
3. Tap Share.
4. Choose Add to Home Screen.
5. Name it **Nexus AI**.
6. Add it.
7. Launch the new Home Screen app instead of the Safari tab.

Open WebUI's PWA runs in standalone mode, removing the normal Safari browser toolbar.

## Custom Branding

A dedicated small Nginx service serves:

- Custom Nexus icon
- Custom web manifest

The manifest uses:

- Name: Nexus AI
- Short name: Nexus AI
- Display: standalone
- Background: black
- Theme: black
- 512x512 PNG icon

## Apple Touch Icon Fix

Open WebUI explicitly declares an Apple Touch Icon under:

`/static/apple-touch-icon.png`

iOS can prefer this explicit icon instead of the manifest icon.

To keep Open WebUI's application files untouched, Nexus uses an Nginx reverse proxy.

The proxy:

- Owns host port 3000.
- Proxies normal requests to Open WebUI:8080.
- Serves the custom Nexus icon when the browser requests `/static/apple-touch-icon.png`.

This makes the Nexus icon appear correctly when installing the PWA.

## PWA Asset Server

The separate PWA asset service listens on host port 8081.

It serves:

`/manifest.webmanifest`

and:

`/nexus-icon.png`

The Open WebUI external manifest configuration points to this service.

## Important

The iPhone PWA is private infrastructure. Do not expose it publicly without adding an appropriate authentication and security layer.
