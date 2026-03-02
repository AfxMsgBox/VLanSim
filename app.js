const DEVICE_TYPES = {
  switch: { label: "交换机", ports: 8 },
  router: { label: "路由器", ports: 4 },
  ap: { label: "AP", ports: 2 },
  pc: { label: "PC/终端", ports: 1 },
};

const BRANDS = ["Mikrotik", "Ubiquiti", "TP-Link"];

const state = {
  devices: [],
  links: [],
  selectedDeviceId: null,
  connectMode: false,
  pendingLinkStart: null,
};

const canvas = document.getElementById("canvas");
const linkLayer = document.getElementById("linkLayer");
const devicePalette = document.getElementById("devicePalette");
const deviceConfig = document.getElementById("deviceConfig");
const simLog = document.getElementById("simLog");

const srcDeviceSelect = document.getElementById("srcDevice");
const srcPortSelect = document.getElementById("srcPort");

const connectModeBtn = document.getElementById("connectModeBtn");
const runSimBtn = document.getElementById("runSimBtn");
const clearBtn = document.getElementById("clearBtn");

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultPorts(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    mode: i === 0 ? "trunk" : "access",
    accessVlan: i === 0 ? 1 : 10,
    allowedVlans: [1, 10, 20],
  }));
}

function addPalette() {
  Object.entries(DEVICE_TYPES).forEach(([key, meta]) => {
    const btn = document.createElement("button");
    btn.textContent = `添加${meta.label}`;
    btn.addEventListener("click", () => addDevice(key));
    devicePalette.appendChild(btn);
  });
}

function addDevice(type) {
  const meta = DEVICE_TYPES[type];
  const id = uid("dev");
  const name = `${meta.label}-${state.devices.length + 1}`;
  const brand = type === "switch" || type === "router" || type === "ap" ? BRANDS[0] : "Generic";
  const device = {
    id,
    type,
    name,
    brand,
    x: 60 + state.devices.length * 24,
    y: 60 + state.devices.length * 16,
    ports: createDefaultPorts(meta.ports),
  };
  state.devices.push(device);
  state.selectedDeviceId = id;
  render();
}

function render() {
  renderDevices();
  renderLinks();
  renderDeviceEditor();
  renderSourceSelects();
}

function renderDevices() {
  canvas.innerHTML = "";
  state.devices.forEach((device) => {
    const div = document.createElement("div");
    div.className = "device" + (device.id === state.selectedDeviceId ? " selected" : "");
    div.style.left = `${device.x}px`;
    div.style.top = `${device.y}px`;

    div.innerHTML = `
      <div class="title">${device.name}</div>
      <div class="meta">${DEVICE_TYPES[device.type].label} · ${device.brand}</div>
      <div class="port-list">
        ${device.ports
          .map(
            (p) =>
              `<button class="port" data-device-id="${device.id}" data-port-id="${p.id}">${p.id}</button>`
          )
          .join("")}
      </div>
    `;

    div.addEventListener("mousedown", (ev) => startDrag(ev, device.id));
    div.addEventListener("click", () => {
      state.selectedDeviceId = device.id;
      render();
    });
    canvas.appendChild(div);
  });

  canvas.querySelectorAll(".port").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!state.connectMode) return;
      const deviceId = btn.dataset.deviceId;
      const portId = btn.dataset.portId;
      handleConnectClick(deviceId, portId);
    });
  });
}

function startDrag(ev, deviceId) {
  if (ev.target.classList.contains("port")) return;
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return;

  const startX = ev.clientX;
  const startY = ev.clientY;
  const baseX = device.x;
  const baseY = device.y;

  const move = (e) => {
    device.x = Math.max(8, baseX + e.clientX - startX);
    device.y = Math.max(8, baseY + e.clientY - startY);
    renderLinks();
    renderDevices();
  };

  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };

  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

function handleConnectClick(deviceId, portId) {
  if (!state.pendingLinkStart) {
    state.pendingLinkStart = { deviceId, portId };
    pushLog(`已选择起点 ${deviceId}:${portId}，请点击终点端口。`);
    return;
  }

  const a = state.pendingLinkStart;
  const b = { deviceId, portId };
  state.pendingLinkStart = null;

  if (a.deviceId === b.deviceId && a.portId === b.portId) {
    pushLog("不能连接同一个端口。", "fail");
    return;
  }

  const exists = state.links.some(
    (link) =>
      (link.a.deviceId === a.deviceId && link.a.portId === a.portId && link.b.deviceId === b.deviceId && link.b.portId === b.portId) ||
      (link.a.deviceId === b.deviceId && link.a.portId === b.portId && link.b.deviceId === a.deviceId && link.b.portId === a.portId)
  );

  if (exists) {
    pushLog("该链路已经存在。", "fail");
    return;
  }

  state.links.push({ id: uid("lnk"), a, b });
  renderLinks();
  pushLog(`已连接 ${a.deviceId}:${a.portId} ↔ ${b.deviceId}:${b.portId}`, "success");
}

function getPortCenter(deviceId, portId) {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return null;
  const idx = device.ports.findIndex((p) => p.id === portId);
  if (idx === -1) return null;

  const col = idx % 2;
  const row = Math.floor(idx / 2);
  const x = device.x + 20 + col * 60;
  const y = device.y + 76 + row * 24;
  return { x, y };
}

function renderLinks() {
  linkLayer.innerHTML = "";
  linkLayer.setAttribute("viewBox", `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);

  state.links.forEach((link) => {
    const a = getPortCenter(link.a.deviceId, link.a.portId);
    const b = getPortCenter(link.b.deviceId, link.b.portId);
    if (!a || !b) return;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", "#38bdf8");
    line.setAttribute("stroke-width", "2");
    linkLayer.appendChild(line);
  });
}

function renderDeviceEditor() {
  const d = state.devices.find((item) => item.id === state.selectedDeviceId);
  if (!d) {
    deviceConfig.innerHTML = '<div class="muted">请选择一个设备进行配置</div>';
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <label>设备名<input id="cfgName" value="${d.name}" /></label>
    <label>品牌
      <select id="cfgBrand">
        ${["Generic", ...BRANDS]
          .map((brand) => `<option value="${brand}" ${brand === d.brand ? "selected" : ""}>${brand}</option>`)
          .join("")}
      </select>
    </label>
    <div id="portRows"></div>
  `;

  const container = wrapper.querySelector("#portRows");
  const tpl = document.getElementById("portRowTemplate");

  d.ports.forEach((port) => {
    const node = tpl.content.cloneNode(true);
    node.querySelector(".port-name").textContent = `${port.id}`;

    const mode = node.querySelector(".port-mode");
    const access = node.querySelector(".port-access-vlan");
    const allowed = node.querySelector(".port-allowed");

    mode.value = port.mode;
    access.value = String(port.accessVlan);
    allowed.value = port.allowedVlans.join(",");

    mode.addEventListener("change", () => {
      port.mode = mode.value;
    });

    access.addEventListener("change", () => {
      port.accessVlan = Number(access.value) || 1;
    });

    allowed.addEventListener("change", () => {
      port.allowedVlans = allowed.value
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4094);
    });

    container.appendChild(node);
  });

  wrapper.querySelector("#cfgName").addEventListener("input", (e) => {
    d.name = e.target.value || d.name;
    renderDevices();
    renderSourceSelects();
  });

  wrapper.querySelector("#cfgBrand").addEventListener("change", (e) => {
    d.brand = e.target.value;
    renderDevices();
  });

  deviceConfig.innerHTML = "";
  deviceConfig.appendChild(wrapper);
}

function renderSourceSelects() {
  const old = srcDeviceSelect.value;
  srcDeviceSelect.innerHTML = state.devices
    .map((d) => `<option value="${d.id}" ${d.id === old ? "selected" : ""}>${d.name}</option>`)
    .join("");
  updateSrcPortSelect();
}

function updateSrcPortSelect() {
  const d = state.devices.find((item) => item.id === srcDeviceSelect.value) || state.devices[0];
  if (!d) {
    srcPortSelect.innerHTML = "";
    return;
  }
  srcPortSelect.innerHTML = d.ports.map((p) => `<option value="${p.id}">${p.id}</option>`).join("");
}

function getNeighbor(deviceId, portId) {
  const link = state.links.find(
    (lnk) =>
      (lnk.a.deviceId === deviceId && lnk.a.portId === portId) ||
      (lnk.b.deviceId === deviceId && lnk.b.portId === portId)
  );
  if (!link) return null;
  return link.a.deviceId === deviceId && link.a.portId === portId ? link.b : link.a;
}

function canForward(device, port, vlan) {
  if (port.mode === "access") {
    return port.accessVlan === vlan;
  }

  let allowed = port.allowedVlans.includes(vlan);

  if (device.brand === "TP-Link" && vlan === 1 && !port.allowedVlans.includes(1)) {
    allowed = false;
  }

  if (device.brand === "Ubiquiti" && port.allowedVlans.length === 0) {
    allowed = false;
  }

  if (device.brand === "Mikrotik" && port.mode === "trunk" && !port.allowedVlans.includes(vlan)) {
    allowed = false;
  }

  return allowed;
}

function simulatePath() {
  simLog.innerHTML = "";

  const srcDevice = state.devices.find((d) => d.id === srcDeviceSelect.value);
  const vlan = Number(document.getElementById("vlanInput").value);
  const srcPort = srcDevice?.ports.find((p) => p.id === srcPortSelect.value);

  if (!srcDevice || !srcPort || !Number.isInteger(vlan)) {
    pushLog("模拟参数不完整。", "fail");
    return;
  }

  const visited = new Set();
  const queue = [{ device: srcDevice, ingressPort: srcPort.id, via: null }];
  pushLog(`起点：${srcDevice.name}:${srcPort.id}，VLAN ${vlan}`);

  while (queue.length) {
    const node = queue.shift();
    const key = `${node.device.id}:${node.ingressPort}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const inPort = node.device.ports.find((p) => p.id === node.ingressPort);
    if (!inPort) continue;

    if (!canForward(node.device, inPort, vlan)) {
      pushLog(
        `阻断：${node.device.name}:${inPort.id} 不允许 VLAN ${vlan} (${inPort.mode})`,
        "fail"
      );
      continue;
    }

    pushLog(`通过：${node.device.name}:${inPort.id} (${node.device.brand}, ${inPort.mode})`, "success");

    node.device.ports
      .filter((port) => port.id !== inPort.id)
      .forEach((egress) => {
        if (!canForward(node.device, egress, vlan)) return;

        const neighbor = getNeighbor(node.device.id, egress.id);
        if (!neighbor) return;

        const nextDevice = state.devices.find((d) => d.id === neighbor.deviceId);
        if (!nextDevice) return;

        queue.push({ device: nextDevice, ingressPort: neighbor.portId, via: `${node.device.id}:${egress.id}` });
      });
  }
}

function pushLog(text, cls = "") {
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.classList.add(cls);
  simLog.appendChild(li);
}

connectModeBtn.addEventListener("click", () => {
  state.connectMode = !state.connectMode;
  state.pendingLinkStart = null;
  connectModeBtn.textContent = `连接模式：${state.connectMode ? "开启" : "关闭"}`;
});

runSimBtn.addEventListener("click", simulatePath);

clearBtn.addEventListener("click", () => {
  state.devices = [];
  state.links = [];
  state.selectedDeviceId = null;
  state.pendingLinkStart = null;
  simLog.innerHTML = "";
  render();
});

srcDeviceSelect.addEventListener("change", updateSrcPortSelect);
window.addEventListener("resize", renderLinks);

addPalette();
addDevice("ap");
addDevice("switch");
addDevice("switch");
addDevice("router");
render();
