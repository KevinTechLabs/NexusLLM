// Homelab awareness for Nexus HQ: live data from NexusLab (machines, GPUs, containers, Pi-hole, power)
// and Sentinel (SOC alerts), turned into a short text the agents can answer from, plus a few safe actions.
//
//   NEXUSLAB_URL=http://<hub>:8484   NEXUSLAB_USER=admin   NEXUSLAB_PASSWORD=...
//   SENTINEL_URL=http://<server>:8088
//
// Reading is free and read-only. The only actions are container start/stop/restart (NexusLab, only for
// machines set to "control") and acknowledging or closing a Sentinel alert, and the dashboard always
// asks you to confirm first.

function makeHomelab({ nexuslabUrl, nexuslabUser = "admin", nexuslabPassword = "", sentinelUrl, log = () => {} }) {
  const nl = nexuslabUrl ? nexuslabUrl.replace(/\/$/, "") : null;
  const sn = sentinelUrl ? sentinelUrl.replace(/\/$/, "") : null;
  let cookie = "", cache = { nl: null, sn: null, at: 0 };
  const errors = { nexuslab: null, sentinel: null };

  async function nlFetch(p, opts = {}, retry = true) {
    const r = await fetch(nl + p, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { Cookie: cookie } : {}) }, redirect: "manual", signal: AbortSignal.timeout(8000) });
    if ((r.status === 401 || r.status === 303 || r.status === 307) && retry && nexuslabPassword) { await nlLogin(); return nlFetch(p, opts, false); }
    if (!r.ok) throw new Error(`NexusLab ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r;
  }
  async function nlLogin() {
    const r = await fetch(nl + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: nexuslabUser, password: nexuslabPassword }), redirect: "manual", signal: AbortSignal.timeout(8000) });
    const set = r.headers.getSetCookie?.() || [r.headers.get("set-cookie")].filter(Boolean);
    if (!r.ok || !set.length) throw new Error(`NexusLab login failed (${r.status}). Check NEXUSLAB_USER and NEXUSLAB_PASSWORD.`);
    cookie = set.map((c) => c.split(";")[0]).join("; ");
  }

  async function refresh(force) {
    if (!force && Date.now() - cache.at < 10000) return cache;
    const [a, b] = await Promise.allSettled([
      nl ? nlFetch("/api/state").then((r) => r.json()) : Promise.resolve(null),
      sn ? fetch(sn + "/api/state", { signal: AbortSignal.timeout(8000) }).then((r) => { if (!r.ok) throw new Error(`Sentinel ${r.status}`); return r.json(); }) : Promise.resolve(null),
    ]);
    errors.nexuslab = a.status === "rejected" ? a.reason.message : null;
    errors.sentinel = b.status === "rejected" ? b.reason.message : null;
    cache = { nl: a.status === "fulfilled" ? a.value : cache.nl, sn: b.status === "fulfilled" ? b.value : cache.sn, at: Date.now() };
    return cache;
  }

  const gb = (b) => (b == null ? "?" : `${(b / 1024 ** 3).toFixed(b > 100 * 1024 ** 3 ? 0 : 1)} GB`);
  const ago = (ms) => { const s = (Date.now() - ms) / 1000; return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
  const openAlert = (a) => a.status !== "closed";
  const SEV = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  // Short numbers for the header chip
  function chip() {
    const ds = cache.nl?.devices || [], al = (cache.sn?.alerts || []).filter(openAlert);
    const off = ds.filter((d) => !d.online && d.power_pending !== "shutdown");
    return {
      configured: !!(nl || sn), at: cache.at,
      machines: ds.length, up: ds.filter((d) => d.online).length, offline: off.map((d) => d.name),
      alerts: al.length, critical: al.filter((a) => a.sev === "critical").length, high: al.filter((a) => a.sev === "high").length,
      errors: { ...errors },
    };
  }

  // Everything an agent needs to answer "is anything down?", "any alerts?", "how hot is the GPU?"
  function text() {
    const out = [`Live homelab data, fetched ${new Date(cache.at).toLocaleString()}.`];
    const ds = cache.nl?.devices;
    if (ds) {
      out.push(`\n# Machines (from NexusLab): ${ds.filter((d) => d.online).length} of ${ds.length} online`);
      for (const d of ds) {
        const m = d.metrics || {};
        if (!d.online) { out.push(`\n## ${d.name}: ${d.power_pending === "shutdown" ? "OFF on purpose" : `OFFLINE (${d.error || "no response"})`}${d.last_seen ? `, last seen ${ago(d.last_seen * 1000)}` : ""}`); continue; }
        const up = m.uptime_s || 0, c = m.cpu || {}, r = m.ram || {}, k = m.disk || {};
        out.push(`\n## ${d.name}: online, up ${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h${m.os ? `, ${m.os}` : ""}`);
        out.push(`- CPU ${Math.round(c.percent || 0)}%${c.cores ? ` of ${c.cores} cores` : ""}${c.temp_c != null ? `, ${Math.round(c.temp_c)} °C` : ""}`);
        out.push(`- Memory ${gb(r.used)} of ${gb(r.total)} (${Math.round(r.percent || 0)}%)`);
        if (k.total) out.push(`- SSD ${gb(k.used)} of ${gb(k.total)} (${Math.round(k.percent || 0)}%)${k.temp_c != null ? `, ${Math.round(k.temp_c)} °C` : ""}`);
        for (const g of m.gpus || []) out.push(`- GPU ${g.name}: ${g.util}% load, VRAM ${gb(g.mem_used)} of ${gb(g.mem_total)}, ${g.temp_c} °C${g.power_w != null ? `, ${Math.round(g.power_w)} W` : ""}`);
        const cs = d.containers?.items || [];
        if (cs.length) {
          const bad = cs.filter((x) => x.status !== "running" || /unhealthy/i.test(x.health || ""));
          out.push(`- Docker (${d.features?.docker === "control" ? "can start/stop/restart" : "view only"}): ${cs.length} containers, ${cs.length - bad.length} running fine${bad.length ? `; NOT OK: ${bad.map((x) => `${x.name} (${x.status}${x.health ? ", " + x.health : ""})`).join(", ")}` : ""}`);
          out.push(`  ${cs.map((x) => `${x.name}=${x.status}`).join(", ")}`);
        }
        const p = d.pihole;
        if (p && p.ok !== false && p.total != null) out.push(`- Pi-hole: blocking ${p.blocking ?? "?"}, ${Number(p.blocked || 0).toLocaleString()} of ${Number(p.total || 0).toLocaleString()} queries blocked (${Number(p.percent || 0).toFixed(1)}%)`);
        const o = d.ollama;
        if (o?.loaded?.length) out.push(`- Ollama loaded: ${o.loaded.map((x) => `${x.name || x}${x.vram ? ` (${gb(x.vram)} VRAM)` : ""}`).join(", ")}`);
      }
      const e = cache.nl.energy;
      if (e && e.watts != null) out.push(`\n# Power: ${Math.round(e.watts)} W now${e.today_kwh != null ? `, ${Number(e.today_kwh).toFixed(2)} kWh today` : ""}${e.month_cost != null ? `, ${e.currency || "$"}${Number(e.month_cost).toFixed(2)} so far this ${e.month_name || "month"}` : ""}${e.month_projected_cost != null ? ` (about ${e.currency || "$"}${Number(e.month_projected_cost).toFixed(2)} projected)` : ""}`);
    } else if (nl) out.push(`\n# Machines: NexusLab couldn't be reached (${errors.nexuslab || "unknown error"}).`);

    const s = cache.sn;
    if (s) {
      const open = (s.alerts || []).filter(openAlert).sort((a, b) => (SEV[a.sev] ?? 9) - (SEV[b.sev] ?? 9) || b.last - a.last);
      const day = (s.alerts || []).filter((a) => a.last > Date.now() - 864e5);
      out.push(`\n# Security (from Sentinel SOC on ${s.host?.name || "the server"}): ${open.length} open alert${open.length === 1 ? "" : "s"} (${open.filter((a) => a.sev === "critical").length} critical, ${open.filter((a) => a.sev === "high").length} high); ${day.length} alert${day.length === 1 ? "" : "s"} active in the last 24 h`);
      for (const a of open.slice(0, 12)) out.push(`- [${a.sev}] ${a.id}: ${a.t}${a.src && a.src !== "—" ? ` from ${a.src}` : ""}${a.count > 1 ? ` ×${a.count}` : ""}, ${a.status}, last ${ago(a.last)}${a.tech ? ` (ATT&CK ${a.tech})` : ""}`);
      const k = s.kpi || {};
      out.push(`- Last hour: ${k.events1h ?? 0} events, ${k.fails1h ?? 0} failed logins, ${k.drops1h ?? 0} firewall drops; ${s.firewall?.blocked?.length ?? 0} address${s.firewall?.blocked?.length === 1 ? "" : "es"} blocked`);
      if (s.pfsense?.lastLog) out.push(`- pfSense logs last received ${ago(s.pfsense.lastLog)}`);
    } else if (sn) out.push(`\n# Security: Sentinel couldn't be reached (${errors.sentinel || "unknown error"}).`);
    return out.join("\n");
  }

  // All containers, to find "restart pihole" etc.
  function containers() {
    return (cache.nl?.devices || []).flatMap((d) => (d.containers?.items || []).map((c) => ({ device: d.id, deviceName: d.name, name: c.name, status: c.status, control: d.features?.docker === "control" })));
  }

  async function containerAction(device, name, action) {
    if (!nl) throw new Error("NexusLab isn't set up (NEXUSLAB_URL in .env)");
    if (!["start", "stop", "restart"].includes(action)) throw new Error("Action must be start, stop or restart");
    const r = await nlFetch(`/api/devices/${encodeURIComponent(device)}/containers/${encodeURIComponent(name)}/${action}`, { method: "POST" });
    cache.at = 0;
    return r.json().catch(() => ({ ok: true }));
  }
  async function alertAction(id, action) {
    if (!sn) throw new Error("Sentinel isn't set up (SENTINEL_URL in .env)");
    if (!["ack", "close", "escalate", "reopen"].includes(action)) throw new Error("Action must be ack, close, escalate or reopen");
    const r = await fetch(sn + "/api/alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Sentinel ${r.status}: ${(await r.text()).slice(0, 160)}`);
    cache.at = 0;
    return r.json().catch(() => ({ ok: true }));
  }

  // Watch for trouble (for phone notifications): new critical/high alerts and machines going offline
  const seen = { alerts: new Set(), offline: new Set(), primed: false };
  async function changes() {
    await refresh(true);
    const out = [];
    for (const a of (cache.sn?.alerts || []).filter(openAlert)) {
      const key = `${a.id}:${a.sev}`;
      if (!seen.alerts.has(key) && seen.primed && (a.sev === "critical" || a.sev === "high")) out.push({ kind: "alert", sev: a.sev, title: `${a.sev === "critical" ? "🚨" : "⚠️"} ${a.t}`, body: `${a.src && a.src !== "—" ? `From ${a.src} · ` : ""}${a.id} in Sentinel` });
      seen.alerts.add(key);
    }
    for (const d of cache.nl?.devices || []) {
      const down = !d.online && d.power_pending !== "shutdown" && d.power_pending !== "reboot";
      if (down && !seen.offline.has(d.id) && seen.primed) out.push({ kind: "offline", sev: "high", title: `🔌 ${d.name} is offline`, body: d.error || "NexusLab can't reach it" });
      if (down) seen.offline.add(d.id); else if (seen.offline.has(d.id)) { seen.offline.delete(d.id); if (seen.primed) out.push({ kind: "online", sev: "info", title: `✅ ${d.name} is back online`, body: "NexusLab can reach it again" }); }
    }
    seen.primed = true;
    return out;
  }

  return { configured: !!(nl || sn), nexuslab: !!nl, sentinel: !!sn, refresh, chip, text, containers, containerAction, alertAction, changes };
}

module.exports = { makeHomelab };
