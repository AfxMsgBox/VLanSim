// js/ui-simulation.js
// Simulation control panel (left sidebar): device/port selects, VLAN input, log output
// Depends on: constants.js, brands.js, state.js, simulation.js

// Append a log entry. cls: "success" | "fail" | "" (info) | "separator"
function pushLog(text, cls) {
  const log = $("simLog");
  const li  = document.createElement("li");
  if (cls === "separator") {
    li.className = "separator";
  } else {
    li.textContent = text;
    if (cls) li.className = cls;
  }
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

// Populate the four selects from state.devices; preserve existing selections where valid.
function renderSimulationPanel() {
  const devices = state.devices;

  function fillDeviceSelect(elId, currentVal) {
    const el = $(elId);
    el.innerHTML = devices
      .map((d) => `<option value="${d.id}" ${d.id === currentVal ? "selected" : ""}>${d.name}</option>`)
      .join("");
  }

  function fillPortSelect(elId, deviceId, currentVal) {
    const el = $(elId);
    const d  = dev(deviceId);
    el.innerHTML = (d?.ports ?? [])
      .map((p) => `<option value="${p.id}" ${p.id === currentVal ? "selected" : ""}>${p.id}</option>`)
      .join("");
  }

  fillDeviceSelect("simDeviceSelect",    state.sim.srcDeviceId);
  fillDeviceSelect("simDstDeviceSelect", state.sim.dstDeviceId);
  fillPortSelect("simPortSelect",    state.sim.srcDeviceId, state.sim.srcPortId);
  fillPortSelect("simDstPortSelect", state.sim.dstDeviceId, state.sim.dstPortId);
}

// Bind all interaction events on the simulation panel. Call once on startup.
function bindSimulationPanel() {
  const srcDevSel  = $("simDeviceSelect");
  const srcPortSel = $("simPortSelect");
  const dstDevSel  = $("simDstDeviceSelect");
  const dstPortSel = $("simDstPortSelect");
  const vlanInput  = $("simVlanInput");
  const runBtn     = $("runSimBtn");
  const clearBtn   = $("clearLogBtn");

  function syncFromDOM() {
    state.sim.srcDeviceId = srcDevSel.value;
    state.sim.srcPortId   = srcPortSel.value;
    state.sim.dstDeviceId = dstDevSel.value;
    state.sim.dstPortId   = dstPortSel.value;
  }

  srcDevSel.addEventListener("change", () => {
    state.sim.srcDeviceId = srcDevSel.value;
    const d = dev(state.sim.srcDeviceId);
    state.sim.srcPortId = d?.ports[0]?.id ?? "";
    renderSimulationPanel();
  });

  srcPortSel.addEventListener("change", () => {
    state.sim.srcPortId = srcPortSel.value;
    syncFromDOM();
  });

  dstDevSel.addEventListener("change", () => {
    state.sim.dstDeviceId = dstDevSel.value;
    const d = dev(state.sim.dstDeviceId);
    state.sim.dstPortId = d?.ports[0]?.id ?? "";
    renderSimulationPanel();
  });

  dstPortSel.addEventListener("change", () => {
    state.sim.dstPortId = dstPortSel.value;
    syncFromDOM();
  });

  // B3: Real-time VLAN ID validation
  vlanInput.addEventListener("input", () => {
    const v = Number(vlanInput.value);
    const valid = Number.isInteger(v) && v >= 1 && v <= 4094;
    vlanInput.classList.toggle("input-error", !valid);
    vlanInput.classList.toggle("input-valid",  valid);
    state.sim.vlanId = vlanInput.value;
  });

  vlanInput.addEventListener("change", () => {
    state.sim.vlanId = vlanInput.value;
  });

  runBtn.addEventListener("click", () => {
    syncFromDOM();
    state.sim.vlanId = vlanInput.value;
    // Insert a visual separator before each run (if log already has entries)
    if ($("simLog").children.length > 0) pushLog("", "separator");
    runSimulation();
  });

  clearBtn.addEventListener("click", () => {
    $("simLog").innerHTML = "";
    state.sim.resultPath = null;
    renderLinks();
  });
}
