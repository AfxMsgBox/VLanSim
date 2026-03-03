// js/ui-editor.js
// Device configuration panel: port editor, brand switching, device management
// Depends on: constants.js, brands.js, state.js, simulation.js

// Show/hide mode-dependent form fields based on current mode selection.
// Each field element can carry one or more CSS classes like "mode-access",
// "mode-trunk", "mode-general", "mode-custom" etc.
function toggleModeFields(row, brand) {
  const strategy = BRAND_STRATEGIES[brand];
  if (!strategy || !strategy.modeKey) return; // Generic: all fields always visible

  const modeSelect = row.querySelector(`[data-key="${strategy.modeKey}"]`);
  if (!modeSelect) return;
  const mode = modeSelect.value;

  row.querySelectorAll("[class]").forEach((el) => {
    const modeClasses = [...el.classList].filter((c) => c.startsWith("mode-"));
    if (!modeClasses.length) return;

    const visible = modeClasses.some((c) => {
      const m = c.slice(5); // strip "mode-" prefix
      if (m === mode)                                                 return true; // exact match
      if (m === "access" && mode === strategy.modeAccessValue)       return true; // access alias
      if (m === "trunk"  && strategy.modeTrunkValues?.includes(mode)) return true; // trunk family
      return false;
    });
    el.style.display = visible ? "grid" : "none";
  });
}

function renderDeviceEditor() {
  const deviceConfig = $("deviceConfig");
  const d = dev(state.selectedDeviceId);
  if (!d) {
    deviceConfig.innerHTML = '<div class="muted">请选择一个设备进行配置</div>';
    return;
  }

  // Brand selector — PC is always Generic
  const brandOptions = BRANDS
    .filter((b) => !(d.type === "pc" && b !== "Generic"))
    .map((b) => `<option value="${b}" ${b === d.brand ? "selected" : ""}>${b}</option>`)
    .join("");

  // Mikrotik bridge settings section (shown for all Mikrotik devices)
  const mikrotikBridgeSection = d.brand === "Mikrotik" ? `
    <div class="section">
      <h3>Mikrotik Bridge</h3>
      <label class="field">
        <span>VLAN Filtering <span class="field-hint" title="bridge vlan-filtering：启用后所有接口按 VLAN 表过滤，否则透传">?</span></span>
        <input id="bridgeFilter" type="checkbox" ${d.mikrotikBridge.vlanFiltering ? "checked" : ""} />
      </label>
      <label class="field">
        <span>Protocol <span class="field-hint" title="bridge protocol-mode：none=无STP，rstp=快速STP，stp=传统STP">?</span></span>
        <select id="bridgeProto">
          <option value="none" ${d.mikrotikBridge.protocolMode === "none" ? "selected" : ""}>none</option>
          <option value="rstp" ${d.mikrotikBridge.protocolMode === "rstp" ? "selected" : ""}>rstp</option>
          <option value="stp"  ${d.mikrotikBridge.protocolMode === "stp"  ? "selected" : ""}>stp</option>
        </select>
      </label>
    </div>
  ` : "";

  deviceConfig.innerHTML = `
    <div class="section">
      <h3>基础信息</h3>
      <label class="field"><span>设备名</span><input id="cfgName" value="${d.name}" /></label>
      <label class="field">
        <span>品牌</span>
        <select id="cfgBrand">${brandOptions}</select>
      </label>
      <div class="inline-actions">
        <button id="addPortBtn">+ 添加端口</button>
        <button id="removePortBtn">− 删除端口</button>
        <button id="deleteDeviceBtn" class="danger">删除设备</button>
      </div>
    </div>
    ${mikrotikBridgeSection}
    <div class="section">
      <h3>端口配置（${d.brand}）</h3>
      <div id="portEditor"></div>
    </div>
  `;

  // Build per-port config rows
  const editor = $("portEditor");
  d.ports.forEach((p) => {
    const row = document.createElement("div");
    row.className = "port-row";
    const markup = (BRAND_STRATEGIES[d.brand] ?? BRAND_STRATEGIES["Generic"]).editorMarkup(p);
    row.innerHTML = `<div class="port-row-title">${p.id}</div>${markup}`;
    editor.appendChild(row);

    // Bind change events for all data-key elements
    row.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      el.addEventListener("change", () => {
        let value;
        if (el.type === "checkbox") {
          value = el.checked;
        } else if (/vlans$/i.test(key)) {
          value = parseVlans(el.value);
        } else if (el.type === "number") {
          value = el.value ? Number(el.value) : null;
        } else {
          value = el.value;
        }
        setByPath(p, key, value);
        toggleModeFields(row, d.brand);
        renderDevices();
        renderLinks();
      });
    });

    toggleModeFields(row, d.brand);
  });

  // Device name
  $("cfgName").addEventListener("input", (e) => {
    d.name = e.target.value || d.name;
    renderDevices();
    renderSimulationPanel();
  });

  // Brand change: convert all port configs via canonical policy
  $("cfgBrand").addEventListener("change", (e) => {
    const oldBrand = d.brand;
    const newBrand = e.target.value;
    if (oldBrand !== newBrand) {
      convertDeviceBrandPorts(d, oldBrand, newBrand);
      d.brand = newBrand;
    }
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

  // B2 fix: Only reset sim src/dst port IDs when the deleted device was actually
  //         the src/dst. Also add confirmation dialog before deleting.
  $("deleteDeviceBtn").addEventListener("click", () => {
    if (!confirm(`确定删除设备 "${d.name}"？相关连线也会被删除。`)) return;

    state.links   = state.links.filter((l) => l.a.deviceId !== d.id && l.b.deviceId !== d.id);
    state.devices = state.devices.filter((x) => x.id !== d.id);
    state.selectedDeviceId = state.devices[0]?.id ?? null;

    // B2: Only update sim selection if the deleted device was src or dst
    if (state.sim.srcDeviceId === d.id) {
      state.sim.srcDeviceId = state.devices[0]?.id ?? "";
      state.sim.srcPortId   = dev(state.sim.srcDeviceId)?.ports[0]?.id ?? "";
    }
    if (state.sim.dstDeviceId === d.id) {
      state.sim.dstDeviceId = state.devices[1]?.id ?? state.devices[0]?.id ?? "";
      state.sim.dstPortId   = dev(state.sim.dstDeviceId)?.ports[0]?.id ?? "";
    }

    renderAll();
  });

  // Mikrotik bridge settings
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
