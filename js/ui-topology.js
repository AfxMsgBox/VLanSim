// js/ui-topology.js
// Topology canvas rendering: device cards, connection lines, connect mode UI
// Depends on: constants.js, brands.js, state.js, simulation.js

function portSummary(d, p) {
  if (!p) return "-";
  const strategy = BRAND_STRATEGIES[d.brand];
  return strategy ? strategy.summary(p) : "-";
}

function renderDevices() {
  const canvas    = $("canvas");
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
      const summary = portSummary(d, p);
      return `<button
        class="port${isPending ? " pending-start" : ""}"
        data-device-id="${d.id}"
        data-port-id="${p.id}"
        title="${d.brand} ${p.id}：${summary}"
      ><span class="port-id">${p.id}</span><small class="policy-badge">${summary}</small></button>`;
    }).join("");

    card.innerHTML = `
      <div class="device-head">
        <img class="brand-logo" src="${BRAND_LOGOS[d.brand] ?? BRAND_LOGOS.Generic}" alt="${d.brand}" />
        <div class="title">${d.name}</div>
      </div>
      <div class="meta">${DEVICE_TYPES[d.type].label} · ${d.brand}</div>
      <div class="port-list">${portButtons}</div>
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

  // Port click handler — used for connect mode
  canvas.querySelectorAll(".port").forEach((button) => {
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!state.connectMode) return;

      const next = { deviceId: button.dataset.deviceId, portId: button.dataset.portId };

      if (!state.pendingLinkStart) {
        state.pendingLinkStart = next;
        const dName = dev(next.deviceId)?.name ?? next.deviceId;
        pushLog(`→ 已选择起点 ${dName}:${next.portId}`);
        renderDevices(); // re-render to show pending-start highlight
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

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", "#3f7bff");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("class", "link-line");
    line.style.pointerEvents = "stroke";

    // U3: Hover highlight to indicate deletability
    line.addEventListener("mouseenter", () => line.setAttribute("stroke", "#e45757"));
    line.addEventListener("mouseleave", () => line.setAttribute("stroke", "#3f7bff"));

    // U3: Confirm before deleting a link
    line.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const da = dev(l.a.deviceId), db = dev(l.b.deviceId);
      const aLabel = `${da?.name ?? l.a.deviceId}:${l.a.portId}`;
      const bLabel = `${db?.name ?? l.b.deviceId}:${l.b.portId}`;
      if (!confirm(`删除连线 ${aLabel} ↔ ${bLabel}？`)) return;
      state.links = state.links.filter((x) => x.id !== l.id);
      pushLog(`→ 已删除连线 ${aLabel} ↔ ${bLabel}`);
      renderLinks();
    });

    const da = dev(l.a.deviceId), db = dev(l.b.deviceId);
    const pa = getPort(da, l.a.portId), pb = getPort(db, l.b.portId);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = `${l.a.portId}:${portSummary(da, pa)} ↔ ${l.b.portId}:${portSummary(db, pb)}`;
    text.setAttribute("x", String((a.x + b.x) / 2));
    text.setAttribute("y", String((a.y + b.y) / 2 - 4));
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "#5f6f89");
    text.setAttribute("text-anchor", "middle");
    text.style.pointerEvents = "none";

    linkLayer.append(line, text);
  });
}
