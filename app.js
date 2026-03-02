const DEVICE_TYPES = {
  switch: { label: "交换机", defaultPorts: 2 },
  router: { label: "路由器", defaultPorts: 2 },
  ap: { label: "AP", defaultPorts: 1 },
  pc: { label: "PC/终端", defaultPorts: 1 },
};

const BRANDS = ["Mikrotik", "Ubiquiti", "TP-Link"];

const BRAND_LOGOS = {
  Mikrotik:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#2f6df6"/><text x="10" y="14" font-size="9" text-anchor="middle" fill="white">MT</text></svg>'),
  Ubiquiti:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#111827"/><text x="10" y="14" font-size="9" text-anchor="middle" fill="white">UB</text></svg>'),
  "TP-Link":
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#06b6d4"/><text x="10" y="14" font-size="8" text-anchor="middle" fill="white">TP</text></svg>'),
  Generic:
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect rx="4" width="20" height="20" fill="#94a3b8"/><text x="10" y="14" font-size="9" text-anchor="middle" fill="white">NW</text></svg>'),
};

const state = {
  devices: [],
  links: [],
  selectedDeviceId: null,
  connectMode: false,
  pendingLinkStart: null,
  sim: { srcDeviceId: "", srcPortId: "", dstDeviceId: "", dstPortId: "", vlanId: "" },
};

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const workspace = $("workspace");
const linkLayer = $("linkLayer");
const devicePalette = $("devicePalette");
const deviceConfig = $("deviceConfig");
const simLog = $("simLog");

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseVlans(input) {
  return String(input)
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4094);
}

function dev(id) {
  return state.devices.find((d) => d.id === id);
}

function getPort(device, portId) {
  return device?.ports.find((p) => p.id === portId);
}

function createPort(index) {
  return {
    id: `p${index + 1}`,
    mode: "access",
    accessVlan: 1,
    allowedVlans: [1],
    tplink: { pvid: 1, ingressFiltering: true, untaggedVlans: [1], taggedVlans: [] },
    ubnt: { profileType: "trunk", nativeNetworkVlan: 1, taggedVlans: [], portIsolation: false, ingressFiltering: true },
    mikrotik: { frameTypes: "admit-all", pvid: 1, ingressFiltering: true },
  };
}

function createDevice(type) {
  const idx = state.devices.length;
  return {
    id: uid("dev"),
    type,
    name: `${DEVICE_TYPES[type].label}-${idx + 1}`,
    brand: type === "pc" ? "Generic" : BRANDS[0],
    x: 60 + (idx % 3) * 230,
    y: 60 + Math.floor(idx / 3) * 170,
    ports: Array.from({ length: DEVICE_TYPES[type].defaultPorts }, (_, i) => createPort(i)),
    mikrotikBridge: { vlanFiltering: true, protocolMode: "rstp" },
  };
}

function portSummary(d, p) {
  if (!p) return "-";
  if (d.brand === "TP-Link") {
    if (p.mode === "access") return `A:${p.tplink.pvid ?? "-"}`;
    const members = [...new Set([...p.tplink.untaggedVlans, ...p.tplink.taggedVlans])];
    return `T:${members.join("/") || "-"}`;
  }
  if (d.brand === "Ubiquiti") {
    if (p.ubnt.profileType === "access") return `A:${p.ubnt.nativeNetworkVlan ?? "-"}`;
    const members = [p.ubnt.nativeNetworkVlan, ...p.ubnt.taggedVlans].filter(Boolean);
    return `T:${members.join("/") || "-"}`;
  }
  if (p.mode === "access") return `A:${p.accessVlan ?? "-"}`;
  return `T:${p.allowedVlans.join("/") || "-"}`;
}

function addPalette() {
  Object.entries(DEVICE_TYPES).forEach(([type, meta]) => {
    const button = document.createElement("button");
    button.textContent = `添加${meta.label}`;
    button.addEventListener("click", () => {
      state.devices.push(createDevice(type));
      state.selectedDeviceId = state.devices[state.devices.length - 1].id;
      renderAll();
    });
    devicePalette.appendChild(button);
  });
}

function renderAll() {
  renderDevices();
  renderLinks();
  renderDeviceEditor();
  renderSimulationPanel();
}

function renderDevices() {
  canvas.innerHTML = "";

  state.devices.forEach((d) => {
    const card = document.createElement("div");
    card.className = `device${state.selectedDeviceId === d.id ? " selected" : ""}`;
    card.style.left = `${d.x}px`;
    card.style.top = `${d.y}px`;

    card.innerHTML = `
      <div class="device-head">
        <img class="brand-logo" src="${BRAND_LOGOS[d.brand] || BRAND_LOGOS.Generic}" alt="${d.brand}" />
        <div class="title">${d.name}</div>
      </div>
      <div class="meta">${DEVICE_TYPES[d.type].label} · ${d.brand}</div>
      <div class="port-list">
        ${d.ports
          .map(
            (p) => `<button class="port" data-device-id="${d.id}" data-port-id="${p.id}">
              <span class="port-id">${p.id}</span>
              <small class="policy-badge">${portSummary(d, p)}</small>
            </button>`
          )
          .join("")}
      </div>
    `;

    card.addEventListener("click", () => {
      state.selectedDeviceId = d.id;
      renderAll();
    });

    card.addEventListener("mousedown", (ev) => {
      if (ev.target.closest(".port")) return;
      const startX = ev.clientX;
      const startY = ev.clientY;
      const baseX = d.x;
      const baseY = d.y;

      const move = (event) => {
        d.x = Math.max(8, baseX + event.clientX - startX);
        d.y = Math.max(8, baseY + event.clientY - startY);
        renderDevices();
        renderLinks();
      };

      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };

      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    canvas.appendChild(card);
  });

  canvas.querySelectorAll(".port").forEach((button) => {
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!state.connectMode) return;

      const next = { deviceId: button.dataset.deviceId, portId: button.dataset.portId };
      if (!state.pendingLinkStart) {
        state.pendingLinkStart = next;
        pushLog(`已选择起点 ${next.deviceId}:${next.portId}`);
        return;
      }

      const start = state.pendingLinkStart;
      state.pendingLinkStart = null;

      if (start.deviceId === next.deviceId && start.portId === next.portId) {
        pushLog("连接失败：不能连接同一端口。", "fail");
        return;
      }

      const occupied = state.links.some(
        (l) =>
          (l.a.deviceId === start.deviceId && l.a.portId === start.portId) ||
          (l.b.deviceId === start.deviceId && l.b.portId === start.portId) ||
          (l.a.deviceId === next.deviceId && l.a.portId === next.portId) ||
          (l.b.deviceId === next.deviceId && l.b.portId === next.portId)
      );
      if (occupied) {
        pushLog("连接失败：一个端口只能连接一条链路。", "fail");
        return;
      }

      state.links.push({ id: uid("lnk"), a: start, b: next });
      pushLog(`已连接 ${start.deviceId}:${start.portId} ↔ ${next.deviceId}:${next.portId}`, "success");
      renderLinks();
    });
  });
}

function getPortCenter(deviceId, portId) {
  const element = canvas.querySelector(`.port[data-device-id="${deviceId}"][data-port-id="${portId}"]`);
  if (!element) return null;
  const pr = element.getBoundingClientRect();
  const wr = workspace.getBoundingClientRect();
  return { x: pr.left - wr.left + pr.width / 2, y: pr.top - wr.top + pr.height / 2 };
}

function renderLinks() {
  linkLayer.innerHTML = "";
  linkLayer.setAttribute("viewBox", `0 0 ${workspace.clientWidth} ${workspace.clientHeight}`);

  state.links.forEach((l) => {
    const a = getPortCenter(l.a.deviceId, l.a.portId);
    const b = getPortCenter(l.b.deviceId, l.b.portId);
    if (!a || !b) return;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", "#3f7bff");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("class", "link-line");
    line.style.pointerEvents = "stroke";
    line.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.links = state.links.filter((x) => x.id !== l.id);
      pushLog(`已删除连接 ${l.a.deviceId}:${l.a.portId} ↔ ${l.b.deviceId}:${l.b.portId}`);
      renderLinks();
    });

    const da = dev(l.a.deviceId);
    const db = dev(l.b.deviceId);
    const pa = getPort(da, l.a.portId);
    const pb = getPort(db, l.b.portId);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = `${l.a.portId}:${portSummary(da, pa)} ↔ ${l.b.portId}:${portSummary(db, pb)}`;
    text.setAttribute("x", String((a.x + b.x) / 2));
    text.setAttribute("y", String((a.y + b.y) / 2 - 4));
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "#5f6f89");
    text.setAttribute("text-anchor", "middle");

    linkLayer.append(line, text);
  });
}

function suggest(msg) {
  return `建议：${msg}`;
}

function evaluatePort(device, p, vlan, direction) {
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) {
    return { ok: false, reason: "VLAN ID 无效", fix: suggest("填写 1-4094 的 VLAN ID") };
  }

  // 基于官方文档常见模型做简化：
  // MikroTik: bridge vlan-filtering + pvid/allowed/ingress-filtering
  // Ubiquiti: access/trunk profile + native/tagged + port isolation
  // TP-Link: pvid + tagged/untagged + ingress filtering

  if (device.brand === "TP-Link") {
    if (p.mode === "access") {
      if (!p.tplink.pvid) return { ok: false, reason: "TP-Link access 端口未设置 PVID", fix: suggest("设置该端口 PVID") };
      return vlan === p.tplink.pvid
        ? { ok: true, reason: `TP-Link access 命中 PVID ${p.tplink.pvid}` }
        : { ok: false, reason: `TP-Link access 仅允许 VLAN ${p.tplink.pvid}`, fix: suggest(`将 PVID 改为 ${vlan}`) };
    }
    const members = [...new Set([...p.tplink.untaggedVlans, ...p.tplink.taggedVlans])];
    if (!members.length) return { ok: false, reason: "TP-Link trunk 成员 VLAN 为空", fix: suggest(`加入 VLAN ${vlan}`) };
    if (p.tplink.ingressFiltering && !members.includes(vlan)) {
      return { ok: false, reason: `TP-Link ingress filtering 丢弃 VLAN ${vlan}`, fix: suggest(`把 VLAN ${vlan} 加入 tagged/untagged`) };
    }
    return members.includes(vlan)
      ? { ok: true, reason: `TP-Link trunk 允许 VLAN ${vlan}` }
      : { ok: false, reason: `TP-Link trunk 未允许 VLAN ${vlan}`, fix: suggest(`把 VLAN ${vlan} 加入成员 VLAN`) };
  }

  if (device.brand === "Ubiquiti") {
    if (p.ubnt.profileType === "access") {
      if (!p.ubnt.nativeNetworkVlan) return { ok: false, reason: "Ubiquiti access profile 未设置 native VLAN", fix: suggest("设置 native VLAN") };
      return vlan === p.ubnt.nativeNetworkVlan
        ? { ok: true, reason: `Ubiquiti access 匹配 native VLAN ${p.ubnt.nativeNetworkVlan}` }
        : { ok: false, reason: `Ubiquiti access 仅 native VLAN ${p.ubnt.nativeNetworkVlan}`, fix: suggest(`改 native VLAN 为 ${vlan}`) };
    }
    const allow = [p.ubnt.nativeNetworkVlan, ...p.ubnt.taggedVlans].filter(Boolean);
    if ((p.ubnt.ingressFiltering ?? true) && !allow.includes(vlan)) {
      return { ok: false, reason: `Ubiquiti trunk profile 未包含 VLAN ${vlan}`, fix: suggest(`在 tagged VLAN 加入 ${vlan}`) };
    }
    if (direction === "egress" && p.ubnt.portIsolation) {
      return { ok: false, reason: "Ubiquiti Port Isolation 阻断转发", fix: suggest("关闭 Port Isolation 或调整 profile") };
    }
    return { ok: true, reason: `Ubiquiti trunk 放行 VLAN ${vlan}` };
  }

  if (device.brand === "Mikrotik") {
    if (device.type === "router" && !device.mikrotikBridge.vlanFiltering) {
      return { ok: true, reason: "Mikrotik bridge vlan-filtering=off（默认桥接）" };
    }
    if (p.mode === "access") {
      const pvid = p.mikrotik.pvid ?? p.accessVlan;
      if (!pvid) return { ok: false, reason: "Mikrotik access 端口未设置 PVID", fix: suggest("设置 PVID") };
      return vlan === pvid
        ? { ok: true, reason: `Mikrotik access 命中 PVID ${pvid}` }
        : { ok: false, reason: `Mikrotik access 仅允许 PVID ${pvid}`, fix: suggest(`将 PVID 改为 ${vlan}`) };
    }
    if (!p.allowedVlans.length) return { ok: false, reason: "Mikrotik trunk allowed VLAN 为空", fix: suggest(`加入 VLAN ${vlan}`) };
    if (p.mikrotik.ingressFiltering && !p.allowedVlans.includes(vlan)) {
      return { ok: false, reason: `Mikrotik ingress-filtering 丢弃 VLAN ${vlan}`, fix: suggest(`将 VLAN ${vlan} 加入 allowed VLANs`) };
    }
    return p.allowedVlans.includes(vlan)
      ? { ok: true, reason: `Mikrotik trunk 允许 VLAN ${vlan}` }
      : { ok: false, reason: `Mikrotik trunk 未允许 VLAN ${vlan}`, fix: suggest(`加入 VLAN ${vlan}`) };
  }

  if (p.mode === "access") {
    if (!p.accessVlan) return { ok: false, reason: "access 口未设置 VLAN", fix: suggest("设置 access VLAN") };
    return vlan === p.accessVlan
      ? { ok: true, reason: `access VLAN ${p.accessVlan} 匹配` }
      : { ok: false, reason: `access VLAN ${p.accessVlan} 不匹配`, fix: suggest(`改为 ${vlan}`) };
  }
  if (!p.allowedVlans.length) return { ok: false, reason: "trunk allowed VLAN 为空", fix: suggest(`加入 VLAN ${vlan}`) };
  return p.allowedVlans.includes(vlan)
    ? { ok: true, reason: `trunk 允许 VLAN ${vlan}` }
    : { ok: false, reason: `trunk 未允许 VLAN ${vlan}`, fix: suggest(`加入 VLAN ${vlan}`) };
}

function neighbor(deviceId, portId) {
  const link = state.links.find(
    (l) =>
      (l.a.deviceId === deviceId && l.a.portId === portId) ||
      (l.b.deviceId === deviceId && l.b.portId === portId)
  );
  if (!link) return null;
  return link.a.deviceId === deviceId && link.a.portId === portId ? link.b : link.a;
}

function runSimulation() {
  simLog.innerHTML = "";
  const vlan = Number(state.sim.vlanId);
  const srcDevice = dev(state.sim.srcDeviceId);
  const dstDevice = dev(state.sim.dstDeviceId);
  const srcPort = getPort(srcDevice, state.sim.srcPortId);
  const dstPort = getPort(dstDevice, state.sim.dstPortId);

  if (!srcDevice || !dstDevice || !srcPort || !dstPort) {
    pushLog("模拟参数不完整：请选择源和目的设备/端口。", "fail");
    return;
  }

  if (srcDevice.id === dstDevice.id && srcPort.id === dstPort.id) {
    pushLog(`源和目的相同：${srcDevice.name}:${srcPort.id}，无需转发。`, "success");
    return;
  }

  const firstHop = neighbor(srcDevice.id, srcPort.id);
  if (!firstHop) {
    pushLog(`阻断：起点端口 ${srcDevice.name}:${srcPort.id} 没有物理链路。${suggest("先把起点端口连接到下游设备")}`, "fail");
    return;
  }

  const srcOut = evaluatePort(srcDevice, srcPort, vlan, "egress");
  if (!srcOut.ok) {
    pushLog(`阻断：设备 ${srcDevice.name} 接口 ${srcPort.id}（出方向）=> ${srcOut.reason}。${srcOut.fix}`, "fail");
    return;
  }

  const firstDevice = dev(firstHop.deviceId);
  pushLog(`开始模拟：VLAN ${vlan}，${srcDevice.name}:${srcPort.id} -> ${dstDevice.name}:${dstPort.id}`);
  pushLog(`流向：${srcDevice.name}:${srcPort.id} -> ${firstDevice?.name || firstHop.deviceId}:${firstHop.portId}（${srcOut.reason}）`);

  const queue = [{
    deviceId: firstHop.deviceId,
    ingressPortId: firstHop.portId,
    path: [`${srcDevice.name}:${srcPort.id}`, `${firstDevice?.name || firstHop.deviceId}:${firstHop.portId}`],
  }];
  const visited = new Set();

  while (queue.length) {
    const node = queue.shift();
    const key = `${node.deviceId}:${node.ingressPortId}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const current = dev(node.deviceId);
    const ingress = getPort(current, node.ingressPortId);
    if (!current || !ingress) continue;

    const ing = evaluatePort(current, ingress, vlan, "ingress");
    if (!ing.ok) {
      pushLog(`阻断：设备 ${current.name} 接口 ${ingress.id}（入方向）=> ${ing.reason}。${ing.fix}`, "fail");
      continue;
    }

    pushLog(`节点：设备 ${current.name} 接口 ${ingress.id}（入方向）通过，原因：${ing.reason}`, "success");

    if (current.id === dstDevice.id && ingress.id === dstPort.id) {
      pushLog(`到达终点：${node.path.join(" -> ")}`, "success");
      return;
    }

    const connectedEgressPorts = current.ports
      .filter((p) => p.id !== ingress.id)
      .filter((p) => neighbor(current.id, p.id));

    if (!connectedEgressPorts.length) {
      pushLog(`阻断：设备 ${current.name} 没有可用的下游已连接端口。${suggest("检查该设备是否有继续转发的链路")}`, "fail");
      continue;
    }

    connectedEgressPorts.forEach((egress) => {
      const out = evaluatePort(current, egress, vlan, "egress");
      if (!out.ok) {
        pushLog(`阻断：设备 ${current.name} 接口 ${egress.id}（出方向）=> ${out.reason}。${out.fix}`, "fail");
        return;
      }

      const nb = neighbor(current.id, egress.id);
      const nextDevice = dev(nb.deviceId);
      if (!nextDevice) return;

      pushLog(`流向：${current.name}:${egress.id} -> ${nextDevice.name}:${nb.portId}（${out.reason}）`);
      queue.push({
        deviceId: nextDevice.id,
        ingressPortId: nb.portId,
        path: [...node.path, `${nextDevice.name}:${nb.portId}`],
      });
    });
  }

  pushLog(`未到达终点 ${dstDevice.name}:${dstPort.id}。${suggest("检查中间链路是否连接、以及每跳接口是否允许该 VLAN")}`, "fail");
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
  cursor[parts[parts.length - 1]] = value;
}


function getCanonicalPolicy(portConfig, brand) {
  if (brand === "TP-Link") {
    const vlanSet = [...new Set([...portConfig.tplink.untaggedVlans, ...portConfig.tplink.taggedVlans])];
    return {
      mode: portConfig.mode,
      accessVlan: portConfig.tplink.pvid ?? 1,
      trunkVlans: vlanSet.length ? vlanSet : [1],
      ingressFiltering: portConfig.tplink.ingressFiltering,
      portIsolation: false,
    };
  }

  if (brand === "Ubiquiti") {
    const mode = portConfig.ubnt.profileType === "access" ? "access" : "trunk";
    const native = portConfig.ubnt.nativeNetworkVlan ?? 1;
    return {
      mode,
      accessVlan: native,
      trunkVlans: [native, ...portConfig.ubnt.taggedVlans].filter(Boolean),
      ingressFiltering: portConfig.ubnt.ingressFiltering ?? true,
      portIsolation: portConfig.ubnt.portIsolation,
    };
  }

  const accessVlan = portConfig.mikrotik.pvid ?? portConfig.accessVlan ?? 1;
  return {
    mode: portConfig.mode,
    accessVlan,
    trunkVlans: portConfig.allowedVlans.length ? portConfig.allowedVlans : [1],
    ingressFiltering: portConfig.mikrotik.ingressFiltering,
    portIsolation: false,
  };
}

function applyCanonicalPolicy(portConfig, targetBrand, canonical) {
  if (targetBrand === "TP-Link") {
    portConfig.mode = canonical.mode;
    portConfig.tplink.pvid = canonical.accessVlan;
    if (canonical.mode === "access") {
      portConfig.tplink.untaggedVlans = [canonical.accessVlan];
      portConfig.tplink.taggedVlans = [];
    } else {
      portConfig.tplink.untaggedVlans = [canonical.accessVlan];
      portConfig.tplink.taggedVlans = canonical.trunkVlans.filter((v) => v !== canonical.accessVlan);
    }
    portConfig.tplink.ingressFiltering = canonical.ingressFiltering;
    return;
  }

  if (targetBrand === "Ubiquiti") {
    portConfig.ubnt.profileType = canonical.mode;
    portConfig.ubnt.nativeNetworkVlan = canonical.accessVlan;
    portConfig.ubnt.taggedVlans = canonical.mode === "trunk" ? canonical.trunkVlans.filter((v) => v !== canonical.accessVlan) : [];
    portConfig.ubnt.portIsolation = canonical.portIsolation;
    portConfig.ubnt.ingressFiltering = canonical.ingressFiltering;
    return;
  }

  portConfig.mode = canonical.mode;
  portConfig.accessVlan = canonical.accessVlan;
  portConfig.mikrotik.pvid = canonical.accessVlan;
  portConfig.allowedVlans = canonical.mode === "trunk" ? canonical.trunkVlans : [canonical.accessVlan];
  portConfig.mikrotik.ingressFiltering = canonical.ingressFiltering;
}

function convertDeviceBrandPorts(device, oldBrand, newBrand) {
  device.ports.forEach((p) => {
    const canonical = getCanonicalPolicy(p, oldBrand);
    applyCanonicalPolicy(p, newBrand, canonical);
  });
}

function toggleModeFields(row, brand) {
  const modeKey = brand === "Ubiquiti" ? "ubnt.profileType" : "mode";
  const modeSelect = row.querySelector(`[data-key="${modeKey}"]`);
  const mode = modeSelect ? modeSelect.value : "access";
  row.querySelectorAll(".mode-access").forEach((el) => {
    el.style.display = mode === "access" ? "grid" : "none";
  });
  row.querySelectorAll(".mode-trunk").forEach((el) => {
    el.style.display = mode === "trunk" ? "grid" : "none";
  });
}

function portEditorMarkup(d, p) {
  if (d.brand === "TP-Link") {
    return `
      <label class="field"><span>端口模式</span><select data-key="mode"><option value="access">access</option><option value="trunk">trunk</option></select></label>
      <label class="field mode-access"><span>PVID</span><input data-key="tplink.pvid" type="number" min="1" max="4094" value="${p.tplink.pvid ?? ""}" /></label>
      <label class="field mode-trunk"><span>Untagged</span><input data-key="tplink.untaggedVlans" value="${p.tplink.untaggedVlans.join(",")}" /></label>
      <label class="field mode-trunk"><span>Tagged</span><input data-key="tplink.taggedVlans" value="${p.tplink.taggedVlans.join(",")}" /></label>
      <label class="field"><span>Ingress</span><input data-key="tplink.ingressFiltering" type="checkbox" ${p.tplink.ingressFiltering ? "checked" : ""} /></label>
    `;
  }

  if (d.brand === "Ubiquiti") {
    return `
      <label class="field"><span>Profile</span><select data-key="ubnt.profileType"><option value="access">access</option><option value="trunk">trunk</option></select></label>
      <label class="field"><span>Native VLAN</span><input data-key="ubnt.nativeNetworkVlan" type="number" min="1" max="4094" value="${p.ubnt.nativeNetworkVlan ?? ""}" /></label>
      <label class="field mode-trunk"><span>Tagged</span><input data-key="ubnt.taggedVlans" value="${p.ubnt.taggedVlans.join(",")}" /></label>
      <label class="field"><span>Isolation</span><input data-key="ubnt.portIsolation" type="checkbox" ${p.ubnt.portIsolation ? "checked" : ""} /></label>
      <label class="field"><span>Ingress</span><input data-key="ubnt.ingressFiltering" type="checkbox" ${(p.ubnt.ingressFiltering ?? true) ? "checked" : ""} /></label>
    `;
  }

  return `
    <label class="field"><span>端口模式</span><select data-key="mode"><option value="access">access</option><option value="trunk">trunk</option></select></label>
    <label class="field mode-access"><span>Access VLAN</span><input data-key="accessVlan" type="number" min="1" max="4094" value="${p.accessVlan ?? ""}" /></label>
    <label class="field mode-trunk"><span>Allowed</span><input data-key="allowedVlans" value="${p.allowedVlans.join(",")}" /></label>
    <label class="field mode-access"><span>PVID</span><input data-key="mikrotik.pvid" type="number" min="1" max="4094" value="${p.mikrotik.pvid ?? ""}" /></label>
    <label class="field"><span>Ingress</span><input data-key="mikrotik.ingressFiltering" type="checkbox" ${p.mikrotik.ingressFiltering ? "checked" : ""} /></label>
  `;
}

function renderDeviceEditor() {
  const d = dev(state.selectedDeviceId);
  if (!d) {
    deviceConfig.innerHTML = '<div class="muted">请选择一个设备进行配置</div>';
    return;
  }

  deviceConfig.innerHTML = `
    <div class="section">
      <h3>基础信息</h3>
      <label class="field"><span>设备名</span><input id="cfgName" value="${d.name}" /></label>
      <label class="field"><span>品牌</span><select id="cfgBrand">${["Generic", ...BRANDS]
        .filter((b) => !(d.type === "pc" && b !== "Generic"))
        .map((b) => `<option value="${b}" ${b === d.brand ? "selected" : ""}>${b}</option>`)
        .join("")}</select></label>
      <div class="inline-actions">
        <button id="addPortBtn">+ 添加端口</button>
        <button id="removePortBtn">- 删除端口</button>
        <button id="deleteDeviceBtn" class="danger">删除设备</button>
      </div>
    </div>

    ${
      d.brand === "Mikrotik" && d.type === "router"
        ? `<div class="section">
            <h3>Mikrotik Bridge</h3>
            <label class="field"><span>VLAN Filtering</span><input id="bridgeFilter" type="checkbox" ${d.mikrotikBridge.vlanFiltering ? "checked" : ""} /></label>
            <label class="field"><span>Protocol</span><select id="bridgeProto"><option value="none" ${d.mikrotikBridge.protocolMode === "none" ? "selected" : ""}>none</option><option value="rstp" ${d.mikrotikBridge.protocolMode === "rstp" ? "selected" : ""}>rstp</option></select></label>
          </div>`
        : ""
    }

    <div class="section">
      <h3>端口配置（${d.brand}）</h3>
      <div id="portEditor"></div>
    </div>
  `;

  const editor = $("portEditor");
  d.ports.forEach((p) => {
    const row = document.createElement("div");
    row.className = "port-row";
    row.innerHTML = `<div class="port-row-title">${p.id}</div>${portEditorMarkup(d, p)}`;
    editor.appendChild(row);

    row.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (key === "mode") el.value = p.mode;
      if (key === "ubnt.profileType") el.value = p.ubnt.profileType;

      el.addEventListener("change", () => {
        let value;
        if (el.type === "checkbox") value = el.checked;
        else if (key.includes("Vlans") || key === "allowedVlans") value = parseVlans(el.value);
        else if (el.type === "number") value = el.value ? Number(el.value) : null;
        else value = el.value;

        setByPath(p, key, value);
        toggleModeFields(row, d.brand);
        renderDevices();
        renderLinks();
      });
    });

    toggleModeFields(row, d.brand);
  });

  $("cfgName").addEventListener("input", (e) => {
    d.name = e.target.value || d.name;
    renderDevices();
    renderSimulationPanel();
  });

  $("cfgBrand").addEventListener("change", (e) => {
    const oldBrand = d.brand;
    const newBrand = e.target.value;
    if (oldBrand !== newBrand) {
      convertDeviceBrandPorts(d, oldBrand, newBrand);
    }
    d.brand = newBrand;
    renderAll();
  });

  $("addPortBtn").addEventListener("click", () => {
    d.ports.push(createPort(d.ports.length));
    renderAll();
  });

  $("removePortBtn").addEventListener("click", () => {
    if (d.ports.length <= 1) return;
    const removed = d.ports.pop();
    state.links = state.links.filter(
      (l) =>
        !(l.a.deviceId === d.id && l.a.portId === removed.id) &&
        !(l.b.deviceId === d.id && l.b.portId === removed.id)
    );
    renderAll();
  });

  $("deleteDeviceBtn").addEventListener("click", () => {
    state.links = state.links.filter((l) => l.a.deviceId !== d.id && l.b.deviceId !== d.id);
    state.devices = state.devices.filter((x) => x.id !== d.id);
    state.selectedDeviceId = state.devices[0]?.id || null;

    if (state.sim.srcDeviceId === d.id) state.sim.srcDeviceId = state.devices[0]?.id || "";
    if (state.sim.dstDeviceId === d.id) state.sim.dstDeviceId = state.devices[0]?.id || "";
    const srcDev = dev(state.sim.srcDeviceId);
    const dstDev = dev(state.sim.dstDeviceId);
    state.sim.srcPortId = srcDev?.ports[0]?.id || "";
    state.sim.dstPortId = dstDev?.ports[0]?.id || "";

    renderAll();
  });

  const bridgeFilter = $("bridgeFilter");
  if (bridgeFilter) {
    bridgeFilter.addEventListener("change", (e) => {
      d.mikrotikBridge.vlanFiltering = e.target.checked;
    });
    $("bridgeProto").addEventListener("change", (e) => {
      d.mikrotikBridge.protocolMode = e.target.value;
    });
  }
}

function renderSimulationPanel() {
  const srcSelect = $("simDeviceSelect");
  const dstSelect = $("simDstDeviceSelect");
  const srcPortSelect = $("simPortSelect");
  const dstPortSelect = $("simDstPortSelect");

  const options = state.devices.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  srcSelect.innerHTML = options;
  dstSelect.innerHTML = options;

  if (!state.devices.length) {
    srcPortSelect.innerHTML = "";
    dstPortSelect.innerHTML = "";
    $("runSimBtn").disabled = true;
    return;
  }
  $("runSimBtn").disabled = false;

  if (!dev(state.sim.srcDeviceId)) state.sim.srcDeviceId = state.devices[0]?.id || "";
  if (!dev(state.sim.dstDeviceId)) state.sim.dstDeviceId = state.devices[1]?.id || state.devices[0]?.id || "";

  srcSelect.value = state.sim.srcDeviceId;
  dstSelect.value = state.sim.dstDeviceId;

  const sDev = dev(state.sim.srcDeviceId);
  const dDev = dev(state.sim.dstDeviceId);

  srcPortSelect.innerHTML = (sDev?.ports || []).map((p) => `<option value="${p.id}">${p.id}</option>`).join("");
  dstPortSelect.innerHTML = (dDev?.ports || []).map((p) => `<option value="${p.id}">${p.id}</option>`).join("");

  if (!getPort(sDev, state.sim.srcPortId)) state.sim.srcPortId = sDev?.ports[0]?.id || "";
  if (!getPort(dDev, state.sim.dstPortId)) state.sim.dstPortId = dDev?.ports[0]?.id || "";

  srcPortSelect.value = state.sim.srcPortId;
  dstPortSelect.value = state.sim.dstPortId;
  $("simVlanInput").value = state.sim.vlanId;
}

function bindSimulationPanel() {
  $("simDeviceSelect").addEventListener("change", (e) => {
    state.sim.srcDeviceId = e.target.value;
    renderSimulationPanel();
  });
  $("simDstDeviceSelect").addEventListener("change", (e) => {
    state.sim.dstDeviceId = e.target.value;
    renderSimulationPanel();
  });
  $("simPortSelect").addEventListener("change", (e) => {
    state.sim.srcPortId = e.target.value;
  });
  $("simDstPortSelect").addEventListener("change", (e) => {
    state.sim.dstPortId = e.target.value;
  });
  $("simVlanInput").addEventListener("change", (e) => {
    state.sim.vlanId = e.target.value ? Number(e.target.value) : "";
  });
  $("runSimBtn").addEventListener("click", runSimulation);
}

function pushLog(text, cls = "") {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  simLog.appendChild(li);
}

$("connectModeBtn").addEventListener("click", () => {
  state.connectMode = !state.connectMode;
  state.pendingLinkStart = null;
  $("connectModeBtn").textContent = `连接模式：${state.connectMode ? "开启" : "关闭"}`;
});

$("clearBtn").addEventListener("click", () => {
  state.devices = [];
  state.links = [];
  state.selectedDeviceId = null;
  state.pendingLinkStart = null;
  state.sim = { srcDeviceId: "", srcPortId: "", dstDeviceId: "", dstPortId: "", vlanId: "" };
  simLog.innerHTML = "";
  renderAll();
});

window.addEventListener("resize", renderLinks);

addPalette();
bindSimulationPanel();
renderAll();
