// js/main.js
// Application entry point: renderAll, device palette, global toolbar events, initialization
// Depends on: all other js/ modules

// Re-render every UI section
function renderAll() {
  renderSimulationPanel();
  renderDevices();
  renderLinks();
  renderDeviceEditor();
}

// Build the device-type palette buttons in the top toolbar
function addPalette() {
  const palette = $("devicePalette");
  palette.innerHTML = "";
  Object.entries(DEVICE_TYPES).forEach(([type, cfg]) => {
    const btn = document.createElement("button");
    btn.textContent = `+ ${cfg.label}`;
    btn.addEventListener("click", () => {
      const d = createDevice(type);
      state.devices.push(d);
      if (!state.selectedDeviceId) state.selectedDeviceId = d.id;

      // Initialize sim src/dst on first two devices
      if (!state.sim.srcDeviceId) {
        state.sim.srcDeviceId = d.id;
        state.sim.srcPortId   = d.ports[0]?.id ?? "";
      } else if (!state.sim.dstDeviceId) {
        state.sim.dstDeviceId = d.id;
        state.sim.dstPortId   = d.ports[0]?.id ?? "";
      }
      renderAll();
    });
    palette.appendChild(btn);
  });
}

// Connect mode toggle (U1)
$("connectModeBtn").addEventListener("click", () => {
  state.connectMode = !state.connectMode;
  state.pendingLinkStart = null;
  const btn = $("connectModeBtn");
  btn.textContent = `连接模式：${state.connectMode ? "开启" : "关闭"}`;
  btn.classList.toggle("active", state.connectMode);
  document.body.classList.toggle("connect-mode-active", state.connectMode);
  renderDevices();
});

// Clear topology with confirmation (U2)
$("clearBtn").addEventListener("click", () => {
  if (!confirm("确定要清空所有设备和连线吗？此操作不可撤销。")) return;
  state.devices          = [];
  state.links            = [];
  state.selectedDeviceId = null;
  state.connectMode      = false;
  state.pendingLinkStart = null;
  state.sim = { srcDeviceId: "", srcPortId: "", dstDeviceId: "", dstPortId: "", vlanId: "" };
  document.body.classList.remove("connect-mode-active");
  $("connectModeBtn").textContent = "连接模式：关闭";
  $("connectModeBtn").classList.remove("active");
  $("simLog").innerHTML = "";
  renderAll();
});

// Re-render links on window resize (SVG viewBox update)
window.addEventListener("resize", () => renderLinks());

// Initialize on page load
addPalette();
bindSimulationPanel();
renderAll();
