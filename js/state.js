// js/state.js
// Application state, utility functions, and device/port factories

function $(id) { return document.getElementById(id); }

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseVlans(input) {
  return String(input)
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4094);
}

function suggest(msg) {
  return `建议：${msg}`;
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) cursor = cursor[parts[i]];
  cursor[parts[parts.length - 1]] = value;
}

function dev(id) {
  return state.devices.find((d) => d.id === id);
}

function getPort(device, portId) {
  return device?.ports.find((p) => p.id === portId);
}

// Creates a port with default values for all brand namespaces
function createPort(index) {
  return {
    id: `p${index + 1}`,

    // TP-Link — Link Type (access/trunk/general), PVID, tagged/untagged VLANs,
    //           Acceptable Frame Types, Ingress Filtering
    tplink: {
      linkType:             "access",
      pvid:                 1,
      untaggedVlans:        [1],
      taggedVlans:          [],
      ingressFiltering:     true,
      acceptableFrameTypes: "admit-all",  // admit-all / tagged-only
    },

    // Ubiquiti (UniFi) — Native VLAN, Tagged VLAN Management, Client Isolation
    ubnt: {
      nativeVlan:   1,
      taggedMode:   "allow-all",          // allow-all / block-all / custom
      taggedVlans:  [],
      portIsolation: false,
    },

    // Mikrotik (RouterOS bridge VLAN filtering) — mode, PVID, frame-types,
    //            allowed VLANs (trunk), ingress-filtering
    mikrotik: {
      mode:             "access",         // access / trunk
      frameTypes:       "admit-all",      // admit-all / admit-only-vlan-tagged /
                                          // admit-only-untagged-and-priority-tagged
      pvid:             1,
      vlans:            [],               // tagged VLANs for trunk mode
      ingressFiltering: true,
    },

    // Generic (IEEE 802.1Q standard) — also the canonical conversion format
    generic: {
      pvid:                 1,
      untaggedVlans:        [1],
      taggedVlans:          [],
      ingressFiltering:     true,
      acceptableFrameTypes: "admit-all",  // admit-all / admit-only-tagged / admit-only-untagged
    },
  };
}

function createDevice(type) {
  const idx = state.devices.length;
  return {
    id:    uid("dev"),
    type,
    name:  `${DEVICE_TYPES[type].label}-${idx + 1}`,
    brand: type === "pc" ? "Generic" : BRANDS[0],
    x:     60 + (idx % 3) * 230,
    y:     60 + Math.floor(idx / 3) * 170,
    ports: Array.from({ length: DEVICE_TYPES[type].defaultPorts }, (_, i) => createPort(i)),
    mikrotikBridge: { vlanFiltering: true, protocolMode: "rstp" },
  };
}

const state = {
  devices:          [],
  links:            [],
  selectedDeviceId: null,
  connectMode:      false,
  pendingLinkStart: null,
  sim: { srcDeviceId: "", srcPortId: "", dstDeviceId: "", dstPortId: "", vlanId: "" },
};
