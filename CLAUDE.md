# VLanSim — Claude Code Guide

## Project Overview

VLanSim is a lightweight, browser-based VLAN topology simulator built with pure vanilla HTML/CSS/JavaScript (no frameworks, no dependencies). It's an educational tool for learning and simulating VLAN configurations and network traffic flow.

## File Structure

```
VLanSim/
├── index.html    # App shell and layout
├── app.js        # All application logic (~789 lines)
└── styles.css    # UI styling
```

There is no build step, no package manager, and no external dependencies.

## Running the App

Open directly in a browser:
```bash
# Option 1: open the file directly
xdg-open index.html

# Option 2: serve with Python (recommended to avoid CORS issues)
python3 -m http.server 8080
# Then visit http://localhost:8080
```

## Testing

There is no automated test suite. Testing is done manually in the browser.

## Code Style

- **Indentation:** 2 spaces
- **Naming:**
  - `camelCase` for variables and functions
  - `CONSTANT_CASE` for top-level constants
- **Patterns:** Arrow functions, template literals, single `state` object for global state
- **No linter or formatter is configured** — follow the conventions already present in `app.js`

## Architecture Notes

- `state` object in `app.js` holds all application state (devices, links, selected port, etc.)
- Rendering is done by directly manipulating the DOM and an SVG overlay for links
- The simulation engine uses BFS to trace packet paths through the topology
- Device types: Switch, Router, AP, PC
- Brands supported: Generic, Mikrotik, Ubiquiti, TP-Link (each has its own VLAN logic)
- Port modes: access and trunk, with brand-specific fields (PVID, native VLAN, tagged VLANs, ingress filtering, port isolation)

## Key Functions in app.js

| Function | Purpose |
|---|---|
| `createDevice(type)` | Add a new device to the canvas |
| `renderDevices()` | Re-render all device cards on the canvas |
| `renderLinks()` | Redraw SVG links between ports |
| `evaluatePort(device, port, vlanId, tagged)` | Core VLAN decision logic for a single port |
| `simulatePacket()` | BFS traversal that traces a packet through the topology |
| `updateDevicePanel(deviceId)` | Populate the right-panel config UI for a device |

## Common Tasks

**Add a new device brand:**
1. Add the brand key to the `BRANDS` constant
2. Add logo/display name to `BRAND_LOGOS`
3. Extend `evaluatePort()` with brand-specific logic
4. Add brand-specific fields to the port config form in `updateDevicePanel()`

**Change VLAN simulation behavior:**
- Edit `evaluatePort()` for per-port logic
- Edit `simulatePacket()` for traversal/BFS logic

**Modify the UI layout:**
- Structure is in `index.html`
- Styles are in `styles.css`
- Dynamic HTML (device cards, port forms) is generated in `app.js` via template literals
