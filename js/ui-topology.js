// js/ui-topology.js
// Topology canvas rendering: device cards, connection lines, connect mode UI
// Depends on: constants.js, brands.js, state.js, simulation.js

function portSummary(d, p) {
  if (!p) return "-";
  const strategy = BRAND_STRATEGIES[d.brand];
  return strategy ? strategy.summary(p) : "-";
}

// Return a CSS class for the port's current mode (access / trunk / general / "")
function portModeClass(device, port) {
  const strategy = BRAND_STRATEGIES[device.brand];
  if (!strategy?.modeKey) return "";
  const val = strategy.modeKey.split(".").reduce((o, k) => o?.[k], port);
  if (!val) return "";
  if (val === strategy.modeAccessValue) return "port-access";
  if (strategy.modeTrunkValues?.includes(val)) return "port-trunk";
  return "";
}

function renderDevices() {
  const canvas = $("canvas");
  canvas.innerHTML = "";

  state.devices.forEach((d) => {
    const card = document.createElement("div");
    card.className = `device${state.selectedDeviceId === d.id ? " selected" : ""}`;
    card.style.left = `${d.x}px`;
    card.style.top  = `${d.y}px`;

    const portButtons = d.ports.map((p) => {
      const isPending =
        state.pendingLinkStart &&
        state.pendingLinkStart.deviceId === d.id &&
        state.pendingLinkStart.portId   === p.id;
      const summary   = portSummary(d, p);
      const modeClass = portModeClass(d, p);
      const classes   = ["port", modeClass, isPending ? "pending-start" : ""].filter(Boolean).join(" ");
      return `<button
        class="${classes}"
        data-device-id="${d.id}"
        data-port-id="${p.id}"
        title="${d.brand} ${p.id}：${summary}"
      ><span class="port-id">${p.id}</span><small class="policy-badge">${summary}</small></button>`;
    }).join("");

    card.innerHTML = `
      <div class="device-head">
        <img class="brand-logo" src="${BRAND_LOGOS[d.brand] ?? BRAND_LOGOS.Generic}" alt="${d.brand}" />
        <div>
          <div class="title">${d.name}</div>
          <div class="meta">${DEVICE_TYPES[d.type].label} · ${d.brand}</div>
        </div>
      </div>
      <div class="device-body">
        <div class="port-list">${portButtons}</div>
      </div>
    `;

    card.addEventListener("click", () => {
      state.selectedDeviceId = d.id;
      renderAll();
    });

    card.addEventListener("mousedown", (ev) => {
      if (ev.target.closest(".port")) return;
      const startX = ev.clientX, startY = ev.clientY;
      const baseX  = d.x,        baseY  = d.y;
      const move = (e) => {
        d.x = Math.max(8, baseX + e.clientX - startX);
        d.y = Math.max(8, baseY + e.clientY - startY);
        renderDevices();
        renderLinks();
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup",   up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup",   up);
    });

    canvas.appendChild(card);
  });

  // Port click handler — connect mode
  canvas.querySelectorAll(".port").forEach((button) => {
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!state.connectMode) return;

      const next = { deviceId: button.dataset.deviceId, portId: button.dataset.portId };

      if (!state.pendingLinkStart) {
        state.pendingLinkStart = next;
        const dName = dev(next.deviceId)?.name ?? next.deviceId;
        pushLog(`→ 已选择起点 ${dName}:${next.portId}`);
        renderDevices();
        return;
      }

      const start = state.pendingLinkStart;
      state.pendingLinkStart = null;

      if (start.deviceId === next.deviceId && start.portId === next.portId) {
        pushLog("✗ 连接失败：不能连接同一端口。", "fail");
        renderDevices();
        return;
      }

      const occupied = state.links.some(
        (l) =>
          (l.a.deviceId === start.deviceId && l.a.portId === start.portId) ||
          (l.b.deviceId === start.deviceId && l.b.portId === start.portId) ||
          (l.a.deviceId === next.deviceId  && l.a.portId === next.portId)  ||
          (l.b.deviceId === next.deviceId  && l.b.portId === next.portId)
      );
      if (occupied) {
        pushLog("✗ 连接失败：一个端口只能连接一条链路。", "fail");
        renderDevices();
        return;
      }

      state.links.push({ id: uid("lnk"), a: start, b: next });
      const aName = dev(start.deviceId)?.name ?? start.deviceId;
      const bName = dev(next.deviceId)?.name  ?? next.deviceId;
      pushLog(`✓ 已连接 ${aName}:${start.portId} ↔ ${bName}:${next.portId}`, "success");
      renderLinks();
      renderDevices();
    });
  });
}

function getPortCenter(deviceId, portId) {
  const canvas    = $("canvas");
  const workspace = $("workspace");
  const element = canvas.querySelector(`.port[data-device-id="${deviceId}"][data-port-id="${portId}"]`);
  if (!element) return null;
  const pr = element.getBoundingClientRect();
  const wr = workspace.getBoundingClientRect();
  return { x: pr.left - wr.left + pr.width / 2, y: pr.top - wr.top + pr.height / 2 };
}

function renderLinks() {
  const linkLayer = $("linkLayer");
  const workspace = $("workspace");
  linkLayer.innerHTML = "";
  linkLayer.setAttribute("viewBox", `0 0 ${workspace.clientWidth} ${workspace.clientHeight}`);

  state.links.forEach((l) => {
    const a = getPortCenter(l.a.deviceId, l.a.portId);
    const b = getPortCenter(l.b.deviceId, l.b.portId);
    if (!a || !b) return;

    const isOnPath    = state.sim.resultPath?.has(l.id) ?? false;
    const strokeColor = isOnPath ? "#1a9560" : "#4a7fff";
    const strokeWidth = isOnPath ? "3" : "2";

    // Orthogonal elbow routing: A → midX (horizontal) → b.y (vertical) → B
    const midX  = (a.x + b.x) / 2;
    const pathD = `M ${a.x} ${a.y} H ${midX} V ${b.y} H ${b.x}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", strokeColor);
    path.setAttribute("stroke-width", strokeWidth);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("class", "link-line");
    path.style.pointerEvents = "stroke";

    path.addEventListener("mouseenter", () => {
      path.setAttribute("stroke", "#e04545");
      path.setAttribute("stroke-width", "3");
    });
    path.addEventListener("mouseleave", () => {
      path.setAttribute("stroke", strokeColor);
      path.setAttribute("stroke-width", strokeWidth);
    });

    // Confirm before deleting
    path.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const da = dev(l.a.deviceId), db = dev(l.b.deviceId);
      const aLabel = `${da?.name ?? l.a.deviceId}:${l.a.portId}`;
      const bLabel = `${db?.name ?? l.b.deviceId}:${l.b.portId}`;
      if (!confirm(`删除连线 ${aLabel} ↔ ${bLabel}？`)) return;
      state.links = state.links.filter((x) => x.id !== l.id);
      // Clear path highlight if this link was on the result path
      if (state.sim.resultPath?.has(l.id)) state.sim.resultPath = null;
      pushLog(`→ 已删除连线 ${aLabel} ↔ ${bLabel}`);
      renderLinks();
    });

    linkLayer.append(path);
  });
}
