// js/simulation.js
// VLAN simulation engine — pure logic, no DOM operations
// Depends on: constants.js, brands.js, state.js
// Calls pushLog() (defined in ui-simulation.js) at runtime — forward reference is safe.

// Evaluate whether a VLAN can pass through a port in a given direction.
// Delegates to the brand strategy for brand-specific logic.
function evaluatePort(device, p, vlan, direction) {
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) {
    return { ok: false, reason: "VLAN ID 无效", fix: suggest("填写 1-4094 的整数 VLAN ID") };
  }
  const strategy = BRAND_STRATEGIES[device.brand] ?? BRAND_STRATEGIES["Generic"];
  return strategy.evaluate(device, p, vlan, direction);
}

// Return the {deviceId, portId} on the other end of the link connected to portId.
// Returns null if no link exists (B4: explicit null handling).
function neighbor(deviceId, portId) {
  const link = state.links.find(
    (l) =>
      (l.a.deviceId === deviceId && l.a.portId === portId) ||
      (l.b.deviceId === deviceId && l.b.portId === portId)
  );
  if (!link) return null;
  return link.a.deviceId === deviceId && link.a.portId === portId ? link.b : link.a;
}

// BFS-based VLAN path tracer.
// B1 fix: visited set tracks device IDs (not port IDs) to prevent infinite loops
//         in ring topologies (A→B→C→A).
// B3 fix: VLAN ID is validated early with a clear error message.
// Find the link object connecting deviceId:portId to its neighbor (or null).
function neighborLink(deviceId, portId) {
  return state.links.find(
    (l) =>
      (l.a.deviceId === deviceId && l.a.portId === portId) ||
      (l.b.deviceId === deviceId && l.b.portId === portId)
  ) ?? null;
}

function runSimulation() {
  $("simLog").innerHTML = "";
  state.sim.resultPath = null;  // clear previous path highlight

  // B3: Validate VLAN ID before anything else
  const vlan = Number(state.sim.vlanId);
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) {
    pushLog("✗ 模拟参数错误：VLAN ID 必须是 1-4094 的整数。", "fail");
    return;
  }

  const srcDevice = dev(state.sim.srcDeviceId);
  const dstDevice = dev(state.sim.dstDeviceId);
  const srcPort   = getPort(srcDevice, state.sim.srcPortId);
  const dstPort   = getPort(dstDevice, state.sim.dstPortId);

  if (!srcDevice || !dstDevice || !srcPort || !dstPort) {
    pushLog("✗ 模拟参数不完整：请选择源和目的设备/端口。", "fail");
    return;
  }

  if (srcDevice.id === dstDevice.id && srcPort.id === dstPort.id) {
    pushLog(`✓ 源和目的相同：${srcDevice.name}:${srcPort.id}，无需转发。`, "success");
    return;
  }

  // Check source egress before looking up the first hop
  const srcOut = evaluatePort(srcDevice, srcPort, vlan, "egress");
  if (!srcOut.ok) {
    pushLog(`✗ 阻断：${srcDevice.name}:${srcPort.id}（出方向）— ${srcOut.reason}。${srcOut.fix ?? ""}`, "fail");
    return;
  }

  const firstLink = neighborLink(srcDevice.id, srcPort.id);
  if (!firstLink) {
    pushLog(`✗ 阻断：${srcDevice.name}:${srcPort.id} 没有物理链路。${suggest("先把起点端口连接到下游设备")}`, "fail");
    return;
  }

  const firstHop    = firstLink.a.deviceId === srcDevice.id && firstLink.a.portId === srcPort.id
    ? firstLink.b : firstLink.a;
  const firstDevice = dev(firstHop.deviceId);

  pushLog(`→ 开始模拟：VLAN ${vlan}，${srcDevice.name}:${srcPort.id} → ${dstDevice.name}:${dstPort.id}`);
  pushLog(`→ 出发：${srcDevice.name}:${srcPort.id} → ${firstDevice?.name ?? firstHop.deviceId}:${firstHop.portId}（${srcOut.reason}）`);

  const queue = [{
    deviceId:      firstHop.deviceId,
    ingressPortId: firstHop.portId,
    path:    [`${srcDevice.name}:${srcPort.id}`, `${firstDevice?.name ?? firstHop.deviceId}:${firstHop.portId}`],
    linkIds: [firstLink.id],
  }];

  // B1: Device-level visited set — prevents revisiting devices in ring topologies
  const visited = new Set();

  while (queue.length) {
    const node = queue.shift();

    // B1: Loop detection
    if (visited.has(node.deviceId)) {
      const loopDev = dev(node.deviceId);
      pushLog(`→ 环路检测：${loopDev?.name ?? node.deviceId} 已在路径中，跳过。`);
      continue;
    }
    visited.add(node.deviceId);

    const current = dev(node.deviceId);
    const ingress = getPort(current, node.ingressPortId);
    if (!current || !ingress) continue;

    const ing = evaluatePort(current, ingress, vlan, "ingress");
    if (!ing.ok) {
      pushLog(`✗ 阻断：${current.name}:${ingress.id}（入方向）— ${ing.reason}。${ing.fix ?? ""}`, "fail");
      continue;
    }

    pushLog(`✓ 通过：${current.name}:${ingress.id}（入方向）— ${ing.reason}`, "success");

    if (current.id === dstDevice.id && ingress.id === dstPort.id) {
      pushLog(`✓ 到达终点：${node.path.join(" → ")}`, "success");
      state.sim.resultPath = new Set(node.linkIds);
      renderLinks();
      return;
    }

    const connectedEgressPorts = current.ports
      .filter((p) => p.id !== ingress.id)
      .filter((p) => neighbor(current.id, p.id));

    if (!connectedEgressPorts.length) {
      pushLog(`✗ 阻断：${current.name} 没有可用的已连接下游端口。${suggest("检查该设备是否有继续转发的链路")}`, "fail");
      continue;
    }

    connectedEgressPorts.forEach((egress) => {
      const out = evaluatePort(current, egress, vlan, "egress");
      if (!out.ok) {
        pushLog(`✗ 阻断：${current.name}:${egress.id}（出方向）— ${out.reason}。${out.fix ?? ""}`, "fail");
        return;
      }

      // B4: Defensive null check
      const nb = neighbor(current.id, egress.id);
      if (!nb) return;

      const nextDevice = dev(nb.deviceId);
      if (!nextDevice) {
        pushLog(`✗ 内部错误：链路另一端设备 ${nb.deviceId} 不存在`, "fail");
        return;
      }

      const egressLink = neighborLink(current.id, egress.id);
      pushLog(`→ 转发：${current.name}:${egress.id} → ${nextDevice.name}:${nb.portId}（${out.reason}）`);
      queue.push({
        deviceId:      nextDevice.id,
        ingressPortId: nb.portId,
        path:          [...node.path, `${nextDevice.name}:${nb.portId}`],
        linkIds:       egressLink ? [...node.linkIds, egressLink.id] : node.linkIds,
      });
    });
  }

  pushLog(`✗ 未到达终点 ${dstDevice.name}:${dstPort.id}。${suggest("检查中间链路及每跳接口是否允许该 VLAN")}`, "fail");
}

// Policy conversion — all delegate to brand strategies.
// Canonical format = Generic IEEE 802.1Q fields.
function getCanonicalPolicy(p, brand) {
  return (BRAND_STRATEGIES[brand] ?? BRAND_STRATEGIES["Generic"]).getCanonical(p);
}

function applyCanonicalPolicy(p, brand, canonical) {
  (BRAND_STRATEGIES[brand] ?? BRAND_STRATEGIES["Generic"]).applyCanonical(p, canonical);
}

// Convert all ports of a device from one brand's config to another via canonical format.
function convertDeviceBrandPorts(device, oldBrand, newBrand) {
  device.ports.forEach((p) => {
    const canonical = getCanonicalPolicy(p, oldBrand);
    applyCanonicalPolicy(p, newBrand, canonical);
  });
}
