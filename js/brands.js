// js/brands.js
// Brand strategy registry — each brand implements IEEE 802.1Q VLAN rules
// in its own notation.
//
// Canonical / Generic format (used as the intermediate for cross-brand conversion):
//   { pvid, untaggedVlans, taggedVlans, ingressFiltering, acceptableFrameTypes }
//
// Each strategy object must implement:
//   evaluate(device, p, vlan, direction) -> { ok, reason, fix? }
//   getCanonical(p)                      -> canonical object
//   applyCanonical(p, canonical)         -> void (mutates brand namespace on port)
//   editorMarkup(p)                      -> HTML string for the port editor
//   summary(p)                           -> short label string for port badge
//   modeKey           dot-path to the mode <select> data-key (null if no modes)
//   modeAccessValue   string value meaning "access mode"
//   modeTrunkValues   array of string values meaning "trunk-like mode"

const BRAND_STRATEGIES = {

  // ===== TP-Link =====
  // Official docs: Link Type (access/trunk/general), PVID, Untagged/Tagged VLANs,
  // Acceptable Frame Types, Ingress Filtering
  "TP-Link": {
    evaluate(device, p, vlan, direction) {
      const tp = p.tplink;

      // Acceptable Frame Types — ingress guard
      if (direction === "ingress" && tp.acceptableFrameTypes === "tagged-only") {
        if (tp.linkType === "access") {
          return {
            ok: false,
            reason: "TP-Link Frame Type=Tagged Only：access 端口不接受未打标帧",
            fix: suggest("将 Frame Type 改为 Admit All，或改用 trunk/general 模式"),
          };
        }
      }

      if (tp.linkType === "access") {
        if (!tp.pvid)
          return { ok: false, reason: "TP-Link access 端口未设置 PVID", fix: suggest("设置该端口 PVID") };
        return vlan === tp.pvid
          ? { ok: true,  reason: `TP-Link access 命中 PVID ${tp.pvid}` }
          : { ok: false, reason: `TP-Link access 仅允许 VLAN ${tp.pvid}`, fix: suggest(`将 PVID 改为 ${vlan}，或改用 trunk/general 模式`) };
      }

      // trunk or general: check member VLANs
      const members = [...new Set([...(tp.untaggedVlans ?? []), ...(tp.taggedVlans ?? [])])];
      if (!members.length)
        return { ok: false, reason: `TP-Link ${tp.linkType} 成员 VLAN 为空`, fix: suggest(`加入 VLAN ${vlan}`) };
      if (tp.ingressFiltering && !members.includes(vlan))
        return { ok: false, reason: `TP-Link ingress filtering 丢弃 VLAN ${vlan}`, fix: suggest(`把 VLAN ${vlan} 加入 tagged/untagged 成员`) };
      return members.includes(vlan)
        ? { ok: true,  reason: `TP-Link ${tp.linkType} 允许 VLAN ${vlan}` }
        : { ok: false, reason: `TP-Link ${tp.linkType} 未允许 VLAN ${vlan}`, fix: suggest(`把 VLAN ${vlan} 加入成员 VLAN`) };
    },

    getCanonical(p) {
      const tp = p.tplink;
      return {
        pvid:                tp.pvid ?? 1,
        untaggedVlans:       tp.linkType === "access" ? [tp.pvid ?? 1] : [...(tp.untaggedVlans ?? [])],
        taggedVlans:         tp.linkType === "access" ? []              : [...(tp.taggedVlans  ?? [])],
        ingressFiltering:    tp.ingressFiltering ?? true,
        acceptableFrameTypes: tp.acceptableFrameTypes === "tagged-only" ? "admit-only-tagged" : "admit-all",
      };
    },

    applyCanonical(p, c) {
      if (!p.tplink) p.tplink = {};
      p.tplink.pvid                = c.pvid;
      p.tplink.ingressFiltering    = c.ingressFiltering;
      p.tplink.acceptableFrameTypes = c.acceptableFrameTypes === "admit-only-tagged" ? "tagged-only" : "admit-all";
      if (c.taggedVlans.length) {
        p.tplink.linkType      = "trunk";
        p.tplink.untaggedVlans = [...c.untaggedVlans];
        p.tplink.taggedVlans   = [...c.taggedVlans];
      } else {
        p.tplink.linkType      = "access";
        p.tplink.untaggedVlans = [c.pvid];
        p.tplink.taggedVlans   = [];
      }
    },

    summary(p) {
      const tp = p.tplink;
      if (tp.linkType === "access") return `A:${tp.pvid ?? "-"}`;
      const members = [...new Set([...(tp.untaggedVlans ?? []), ...(tp.taggedVlans ?? [])])];
      const prefix  = tp.linkType === "general" ? "G" : "T";
      return `${prefix}:${members.join("/") || "-"}`;
    },

    editorMarkup(p) {
      const tp = p.tplink;
      return `
        <label class="field">
          <span>Link Type <span class="field-hint" title="access=单VLAN去标签，trunk=多VLAN保标签，general=混合（打标/未打标均接受）">?</span></span>
          <select data-key="tplink.linkType">
            <option value="access"  ${tp.linkType === "access"  ? "selected" : ""}>Access</option>
            <option value="trunk"   ${tp.linkType === "trunk"   ? "selected" : ""}>Trunk</option>
            <option value="general" ${tp.linkType === "general" ? "selected" : ""}>General</option>
          </select>
        </label>
        <label class="field mode-access">
          <span>PVID <span class="field-hint" title="Port VLAN ID：入方向未打标帧归入此 VLAN">?</span></span>
          <input data-key="tplink.pvid" type="number" min="1" max="4094" value="${tp.pvid ?? ""}" />
        </label>
        <label class="field mode-trunk mode-general">
          <span>Untagged <span class="field-hint" title="出方向去标签的 VLAN 列表，逗号分隔">?</span></span>
          <input data-key="tplink.untaggedVlans" value="${(tp.untaggedVlans ?? []).join(",")}" />
        </label>
        <label class="field mode-trunk mode-general">
          <span>Tagged <span class="field-hint" title="出方向保留标签的 VLAN 列表，逗号分隔">?</span></span>
          <input data-key="tplink.taggedVlans" value="${(tp.taggedVlans ?? []).join(",")}" />
        </label>
        <label class="field">
          <span>Frame Type <span class="field-hint" title="Admit All=接受所有帧；Tagged Only=仅接受已打标帧">?</span></span>
          <select data-key="tplink.acceptableFrameTypes">
            <option value="admit-all"   ${(tp.acceptableFrameTypes ?? "admit-all") === "admit-all" ? "selected" : ""}>Admit All</option>
            <option value="tagged-only" ${tp.acceptableFrameTypes === "tagged-only"                ? "selected" : ""}>Tagged Only</option>
          </select>
        </label>
        <label class="field">
          <span>Ingress <span class="field-hint" title="入方向过滤：丢弃不在成员 VLAN 中的帧">?</span></span>
          <input data-key="tplink.ingressFiltering" type="checkbox" ${tp.ingressFiltering ? "checked" : ""} />
        </label>`;
    },

    modeKey:         "tplink.linkType",
    modeAccessValue: "access",
    modeTrunkValues: ["trunk", "general"],
  },

  // ===== Ubiquiti (UniFi) =====
  // Official docs (v8.0+): Native VLAN, Tagged VLAN Management (Allow All / Block All / Custom),
  // Client Isolation
  "Ubiquiti": {
    evaluate(device, p, vlan, direction) {
      const u = p.ubnt;

      // Client Isolation blocks all egress
      if (direction === "egress" && u.portIsolation) {
        return { ok: false, reason: "Ubiquiti Client Isolation 阻断转发", fix: suggest("关闭 Client Isolation") };
      }

      if (u.taggedMode === "allow-all") {
        return { ok: true, reason: `Ubiquiti Allow All — VLAN ${vlan} 放行` };
      }

      if (u.taggedMode === "block-all") {
        if (!u.nativeVlan)
          return { ok: false, reason: "Ubiquiti 未设置 Native VLAN", fix: suggest("设置 Native VLAN") };
        return vlan === u.nativeVlan
          ? { ok: true,  reason: `Ubiquiti Block All — 命中 Native VLAN ${u.nativeVlan}` }
          : { ok: false, reason: `Ubiquiti Block All — 仅允许 Native VLAN ${u.nativeVlan}`, fix: suggest(`改 Native VLAN 为 ${vlan}，或改用 Custom 模式`) };
      }

      // custom mode
      const allowed = [u.nativeVlan, ...(u.taggedVlans ?? [])].filter(Boolean);
      return allowed.includes(vlan)
        ? { ok: true,  reason: `Ubiquiti Custom — VLAN ${vlan} 在允许列表中` }
        : { ok: false, reason: `Ubiquiti Custom — VLAN ${vlan} 不在允许列表中`, fix: suggest(`在 Custom VLANs 中加入 ${vlan}`) };
    },

    getCanonical(p) {
      const u = p.ubnt;
      return {
        pvid:                u.nativeVlan ?? 1,
        untaggedVlans:       [u.nativeVlan ?? 1],
        taggedVlans:         u.taggedMode === "custom" ? [...(u.taggedVlans ?? [])] : [],
        ingressFiltering:    u.taggedMode !== "allow-all",
        acceptableFrameTypes: "admit-all",
      };
    },

    applyCanonical(p, c) {
      if (!p.ubnt) p.ubnt = {};
      p.ubnt.nativeVlan    = c.pvid;
      p.ubnt.portIsolation = false;
      if (c.taggedVlans.length) {
        p.ubnt.taggedMode  = "custom";
        p.ubnt.taggedVlans = [...c.taggedVlans];
      } else {
        p.ubnt.taggedMode  = "block-all";
        p.ubnt.taggedVlans = [];
      }
    },

    summary(p) {
      const u = p.ubnt;
      if (u.taggedMode === "block-all") return `A:${u.nativeVlan ?? "-"}`;
      if (u.taggedMode === "allow-all") return `T:all`;
      const members = [u.nativeVlan, ...(u.taggedVlans ?? [])].filter(Boolean);
      return `C:${members.join("/") || "-"}`;
    },

    editorMarkup(p) {
      const u = p.ubnt;
      return `
        <label class="field">
          <span>VLAN Mgmt <span class="field-hint" title="Allow All=全部放行（Trunk）；Block All=仅 Native（Access）；Custom=指定列表（Trunk）">?</span></span>
          <select data-key="ubnt.taggedMode">
            <option value="allow-all" ${u.taggedMode === "allow-all" ? "selected" : ""}>Allow All</option>
            <option value="block-all" ${u.taggedMode === "block-all" ? "selected" : ""}>Block All</option>
            <option value="custom"    ${u.taggedMode === "custom"    ? "selected" : ""}>Custom</option>
          </select>
        </label>
        <label class="field">
          <span>Native VLAN <span class="field-hint" title="未打标流量所属的 VLAN（原生 VLAN / PVID）">?</span></span>
          <input data-key="ubnt.nativeVlan" type="number" min="1" max="4094" value="${u.nativeVlan ?? ""}" />
        </label>
        <label class="field mode-custom">
          <span>Custom VLANs <span class="field-hint" title="Custom 模式下允许通过的 tagged VLAN 列表，逗号分隔">?</span></span>
          <input data-key="ubnt.taggedVlans" value="${(u.taggedVlans ?? []).join(",")}" />
        </label>
        <label class="field">
          <span>Isolation <span class="field-hint" title="Client Isolation：阻断该端口的所有二层转发（出方向）">?</span></span>
          <input data-key="ubnt.portIsolation" type="checkbox" ${u.portIsolation ? "checked" : ""} />
        </label>`;
    },

    modeKey:         "ubnt.taggedMode",
    modeAccessValue: "block-all",
    modeTrunkValues: ["allow-all", "custom"],
  },

  // ===== Mikrotik (RouterOS Bridge VLAN Filtering) =====
  // Official docs: bridge vlan-filtering, bridge port pvid/frame-types/ingress-filtering,
  // /interface bridge vlan tagged/untagged ports
  "Mikrotik": {
    evaluate(device, p, vlan, direction) {
      const mt = p.mikrotik;

      // Bridge VLAN Filtering disabled → transparent forwarding
      if (device.mikrotikBridge && !device.mikrotikBridge.vlanFiltering) {
        return { ok: true, reason: "Mikrotik bridge vlan-filtering=off（透传转发）" };
      }

      // frame-types ingress guard
      if (direction === "ingress") {
        if (mt.frameTypes === "admit-only-vlan-tagged" && mt.mode === "access") {
          return {
            ok: false,
            reason: "Mikrotik frame-types=admit-only-vlan-tagged：access 端口拒绝未打标帧",
            fix: suggest("改为 admit-all，或改为 trunk 模式"),
          };
        }
        if (mt.frameTypes === "admit-only-untagged-and-priority-tagged" && mt.mode === "trunk") {
          return {
            ok: false,
            reason: "Mikrotik frame-types=admit-only-untagged：trunk 端口拒绝已打标帧",
            fix: suggest("改为 admit-all，或改为 access 模式"),
          };
        }
      }

      if (mt.mode === "access") {
        const pvid = mt.pvid ?? 1;
        return vlan === pvid
          ? { ok: true,  reason: `Mikrotik access 命中 PVID ${pvid}` }
          : { ok: false, reason: `Mikrotik access 仅允许 PVID ${pvid}`, fix: suggest(`将 PVID 改为 ${vlan}`) };
      }

      // trunk mode
      const vlans = mt.vlans ?? [];
      if (!vlans.length)
        return { ok: false, reason: "Mikrotik trunk VLAN 列表为空", fix: suggest(`加入 VLAN ${vlan}`) };
      if ((mt.ingressFiltering ?? true) && !vlans.includes(vlan))
        return { ok: false, reason: `Mikrotik ingress-filtering 丢弃 VLAN ${vlan}`, fix: suggest(`将 VLAN ${vlan} 加入允许列表`) };
      return vlans.includes(vlan)
        ? { ok: true,  reason: `Mikrotik trunk 允许 VLAN ${vlan}` }
        : { ok: false, reason: `Mikrotik trunk 未允许 VLAN ${vlan}`, fix: suggest(`加入 VLAN ${vlan}`) };
    },

    getCanonical(p) {
      const mt = p.mikrotik;
      const pvid = mt.pvid ?? 1;
      return {
        pvid,
        untaggedVlans:       mt.mode === "access" ? [pvid] : [],
        taggedVlans:         mt.mode === "trunk"  ? [...(mt.vlans ?? [])] : [],
        ingressFiltering:    mt.ingressFiltering ?? true,
        acceptableFrameTypes:
          mt.frameTypes === "admit-only-vlan-tagged"                  ? "admit-only-tagged"
          : mt.frameTypes === "admit-only-untagged-and-priority-tagged" ? "admit-only-untagged"
          : "admit-all",
      };
    },

    applyCanonical(p, c) {
      if (!p.mikrotik) p.mikrotik = {};
      p.mikrotik.pvid             = c.pvid;
      p.mikrotik.ingressFiltering = c.ingressFiltering;
      p.mikrotik.frameTypes =
        c.acceptableFrameTypes === "admit-only-tagged"   ? "admit-only-vlan-tagged"
        : c.acceptableFrameTypes === "admit-only-untagged" ? "admit-only-untagged-and-priority-tagged"
        : "admit-all";
      if (c.taggedVlans.length) {
        p.mikrotik.mode  = "trunk";
        p.mikrotik.vlans = [...c.taggedVlans];
      } else {
        p.mikrotik.mode  = "access";
        p.mikrotik.vlans = [];
      }
    },

    summary(p) {
      const mt = p.mikrotik;
      if (mt.mode === "access") return `A:${mt.pvid ?? "-"}`;
      return `T:${(mt.vlans ?? []).join("/") || "-"}`;
    },

    editorMarkup(p) {
      const mt = p.mikrotik;
      return `
        <label class="field">
          <span>Mode <span class="field-hint" title="access=单VLAN（untagged port），trunk=多VLAN（tagged port）">?</span></span>
          <select data-key="mikrotik.mode">
            <option value="access" ${mt.mode === "access" ? "selected" : ""}>Access</option>
            <option value="trunk"  ${mt.mode === "trunk"  ? "selected" : ""}>Trunk</option>
          </select>
        </label>
        <label class="field mode-access">
          <span>PVID <span class="field-hint" title="Port VLAN ID：入方向未打标帧的默认 VLAN（bridge port pvid）">?</span></span>
          <input data-key="mikrotik.pvid" type="number" min="1" max="4094" value="${mt.pvid ?? ""}" />
        </label>
        <label class="field mode-trunk">
          <span>VLANs <span class="field-hint" title="trunk 模式下允许的 tagged VLAN 列表（bridge vlan table tagged），逗号分隔">?</span></span>
          <input data-key="mikrotik.vlans" value="${(mt.vlans ?? []).join(",")}" />
        </label>
        <label class="field">
          <span>frame-types <span class="field-hint" title="admit-all=全部；admit-only-vlan-tagged=仅打标帧；admit-only-untagged=仅未打标帧">?</span></span>
          <select data-key="mikrotik.frameTypes">
            <option value="admit-all"                               ${(mt.frameTypes ?? "admit-all") === "admit-all"                               ? "selected" : ""}>admit-all</option>
            <option value="admit-only-vlan-tagged"                  ${mt.frameTypes === "admit-only-vlan-tagged"                                   ? "selected" : ""}>admit-only-vlan-tagged</option>
            <option value="admit-only-untagged-and-priority-tagged" ${mt.frameTypes === "admit-only-untagged-and-priority-tagged"                  ? "selected" : ""}>admit-only-untagged</option>
          </select>
        </label>
        <label class="field">
          <span>ingress <span class="field-hint" title="ingress-filtering：丢弃入方向不在允许 VLAN 列表中的帧">?</span></span>
          <input data-key="mikrotik.ingressFiltering" type="checkbox" ${(mt.ingressFiltering ?? true) ? "checked" : ""} />
        </label>`;
    },

    modeKey:         "mikrotik.mode",
    modeAccessValue: "access",
    modeTrunkValues: ["trunk"],
  },

  // ===== Mikrotik SwOS =====
  // CSS-series switches running SwOS. Simplified per-port VLAN table model.
  // Each port has a PVID (for untagged ingress), a list of tagged trunk VLANs,
  // and an untagEgress flag (strip tag on egress for the pvid VLAN).
  "Mikrotik SwOS": {
    evaluate(device, p, vlan, direction) {
      const sw = p.swos;
      const allowed = [...new Set([sw.pvid, ...(sw.vlans ?? [])])].filter(Boolean);

      if (direction === "ingress") {
        if (!allowed.includes(vlan))
          return {
            ok: false,
            reason: `SwOS 端口不允许 VLAN ${vlan}（pvid=${sw.pvid}，trunk=${(sw.vlans ?? []).join(",") || "无"}）`,
            fix: suggest(`将 VLAN ${vlan} 设为 PVID，或加入 Tagged VLANs`),
          };
        return { ok: true, reason: `SwOS VLAN ${vlan} 允许入方向（pvid=${sw.pvid}）` };
      }

      // Egress
      if (!allowed.includes(vlan))
        return {
          ok: false,
          reason: `SwOS 端口出方向不允许 VLAN ${vlan}`,
          fix: suggest(`将 VLAN ${vlan} 加入 Tagged VLANs 或改为 PVID`),
        };
      return { ok: true, reason: `SwOS VLAN ${vlan} 允许出方向` };
    },

    getCanonical(p) {
      const sw = p.swos;
      return {
        pvid:                sw.pvid ?? 1,
        untaggedVlans:       sw.untagEgress !== false ? [sw.pvid ?? 1] : [],
        taggedVlans:         [...(sw.vlans ?? [])],
        ingressFiltering:    true,
        acceptableFrameTypes: "admit-all",
      };
    },

    applyCanonical(p, c) {
      if (!p.swos) p.swos = {};
      p.swos.pvid        = c.pvid;
      p.swos.vlans       = [...c.taggedVlans];
      p.swos.untagEgress = c.untaggedVlans.includes(c.pvid);
    },

    summary(p) {
      const sw = p.swos;
      if (!(sw.vlans ?? []).length) return `A:${sw.pvid ?? "-"}`;
      return `T:${sw.vlans.join("/") || "-"}`;
    },

    editorMarkup(p) {
      const sw = p.swos;
      return `
        <label class="field">
          <span>PVID <span class="field-hint" title="Port VLAN ID：未打标帧入方向归入此 VLAN（SwOS：VLAN ID 字段）">?</span></span>
          <input data-key="swos.pvid" type="number" min="1" max="4094" value="${sw.pvid ?? ""}" />
        </label>
        <label class="field">
          <span>Tagged VLANs <span class="field-hint" title="此端口允许通过的 tagged VLAN 列表（SwOS VLAN 表成员），逗号分隔">?</span></span>
          <input data-key="swos.vlans" value="${(sw.vlans ?? []).join(",")}" />
        </label>
        <label class="field">
          <span>Untag Egress <span class="field-hint" title="出方向对 PVID VLAN 去标签（SwOS：egress 设为 untagged）">?</span></span>
          <input data-key="swos.untagEgress" type="checkbox" ${sw.untagEgress !== false ? "checked" : ""} />
        </label>`;
    },

    modeKey:         null,   // SwOS has no explicit mode selector
    modeAccessValue: null,
    modeTrunkValues: [],
  },

  // ===== Generic (IEEE 802.1Q Standard) =====
  // Follows the IEEE 802.1Q standard directly. Also serves as the canonical
  // intermediate format for cross-brand port configuration conversion.
  "Generic": {
    evaluate(device, p, vlan, direction) {
      const g = p.generic;
      const allMembers = [...new Set([...(g.untaggedVlans ?? []), ...(g.taggedVlans ?? [])])];

      // Acceptable Frame Types — ingress guard
      if (direction === "ingress") {
        if (g.acceptableFrameTypes === "admit-only-tagged") {
          if (!(g.taggedVlans ?? []).includes(vlan) && vlan === g.pvid) {
            return {
              ok: false,
              reason: `IEEE 802.1Q admit-only-tagged：VLAN ${vlan} 以未打标帧入方向，被拒绝`,
              fix: suggest("改为 Admit All，或将 VLAN 加入 tagged 列表"),
            };
          }
        }
        if (g.acceptableFrameTypes === "admit-only-untagged") {
          if ((g.taggedVlans ?? []).includes(vlan)) {
            return {
              ok: false,
              reason: `IEEE 802.1Q admit-only-untagged：VLAN ${vlan} 为 tagged，被拒绝`,
              fix: suggest("改为 Admit All，或将 VLAN 移至 untagged 列表"),
            };
          }
        }
      }

      if (!allMembers.length)
        return { ok: false, reason: "IEEE 802.1Q 端口 VLAN 成员为空", fix: suggest(`加入 VLAN ${vlan}`) };
      if ((g.ingressFiltering ?? true) && !allMembers.includes(vlan))
        return { ok: false, reason: `IEEE 802.1Q ingress filtering 丢弃 VLAN ${vlan}`, fix: suggest(`将 VLAN ${vlan} 加入端口成员`) };
      return allMembers.includes(vlan)
        ? { ok: true,  reason: `IEEE 802.1Q VLAN ${vlan} 在端口成员列表中` }
        : { ok: false, reason: `IEEE 802.1Q VLAN ${vlan} 不在端口成员列表中`, fix: suggest(`将 VLAN ${vlan} 加入端口成员`) };
    },

    getCanonical(p) {
      const g = p.generic;
      return {
        pvid:                g.pvid ?? 1,
        untaggedVlans:       [...(g.untaggedVlans ?? [])],
        taggedVlans:         [...(g.taggedVlans   ?? [])],
        ingressFiltering:    g.ingressFiltering ?? true,
        acceptableFrameTypes: g.acceptableFrameTypes ?? "admit-all",
      };
    },

    applyCanonical(p, c) {
      if (!p.generic) p.generic = {};
      p.generic.pvid                = c.pvid;
      p.generic.untaggedVlans       = [...c.untaggedVlans];
      p.generic.taggedVlans         = [...c.taggedVlans];
      p.generic.ingressFiltering    = c.ingressFiltering;
      p.generic.acceptableFrameTypes = c.acceptableFrameTypes;
    },

    summary(p) {
      const g = p.generic;
      const tagged   = g.taggedVlans   ?? [];
      const untagged = g.untaggedVlans ?? [];
      if (!tagged.length) return `A:${g.pvid ?? "-"}`;
      const all = [...new Set([...untagged, ...tagged])];
      return `T:${all.join("/") || "-"}`;
    },

    editorMarkup(p) {
      const g = p.generic;
      return `
        <label class="field">
          <span>PVID <span class="field-hint" title="Port VLAN ID（IEEE 802.1Q）：入方向未打标帧归入此 VLAN">?</span></span>
          <input data-key="generic.pvid" type="number" min="1" max="4094" value="${g.pvid ?? ""}" />
        </label>
        <label class="field">
          <span>Untagged <span class="field-hint" title="出方向去标签的 VLAN 成员列表，逗号分隔">?</span></span>
          <input data-key="generic.untaggedVlans" value="${(g.untaggedVlans ?? []).join(",")}" />
        </label>
        <label class="field">
          <span>Tagged <span class="field-hint" title="出方向保留标签的 VLAN 成员列表，逗号分隔">?</span></span>
          <input data-key="generic.taggedVlans" value="${(g.taggedVlans ?? []).join(",")}" />
        </label>
        <label class="field">
          <span>Frame Types <span class="field-hint" title="Admit All=接受所有帧；Admit Only Tagged=仅已打标；Admit Only Untagged=仅未打标">?</span></span>
          <select data-key="generic.acceptableFrameTypes">
            <option value="admit-all"           ${(g.acceptableFrameTypes ?? "admit-all") === "admit-all"           ? "selected" : ""}>Admit All</option>
            <option value="admit-only-tagged"   ${g.acceptableFrameTypes === "admit-only-tagged"                    ? "selected" : ""}>Admit Only Tagged</option>
            <option value="admit-only-untagged" ${g.acceptableFrameTypes === "admit-only-untagged"                  ? "selected" : ""}>Admit Only Untagged</option>
          </select>
        </label>
        <label class="field">
          <span>Ingress <span class="field-hint" title="Ingress Filtering（IEEE 802.1Q）：丢弃不在端口成员 VLAN 中的帧">?</span></span>
          <input data-key="generic.ingressFiltering" type="checkbox" ${(g.ingressFiltering ?? true) ? "checked" : ""} />
        </label>`;
    },

    modeKey:         null,   // Generic has no mode — all fields always visible
    modeAccessValue: null,
    modeTrunkValues: [],
  },
};
