// js/constants.js
// Static constants — no external dependencies

const DEVICE_TYPES = {
  switch: { label: "交换机", defaultPorts: 2 },
  router: { label: "路由器", defaultPorts: 2 },
  ap:     { label: "AP",     defaultPorts: 1 },
  pc:     { label: "PC/终端", defaultPorts: 1 },
};

// Generic is a first-class brand following IEEE 802.1Q standard
const BRANDS = ["Mikrotik", "Mikrotik SwOS", "Ubiquiti", "TP-Link", "Generic"];

const BRAND_LOGOS = {
  Mikrotik:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#2f6df6"/><text x="10" y="14" font-size="9" text-anchor="middle" fill="white">MT</text></svg>'),
  "Mikrotik SwOS":
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#1e52c8"/><text x="10" y="10" font-size="6.5" text-anchor="middle" fill="white">MT</text><text x="10" y="17" font-size="5.5" text-anchor="middle" fill="#93c5fd">SwOS</text></svg>'),
  Ubiquiti:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#111827"/><text x="10" y="14" font-size="9" text-anchor="middle" fill="white">UB</text></svg>'),
  "TP-Link":
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#06b6d4"/><text x="10" y="14" font-size="8" text-anchor="middle" fill="white">TP</text></svg>'),
  Generic:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#7c3aed"/><text x="10" y="14" font-size="8" text-anchor="middle" fill="white">802</text></svg>'),
};
