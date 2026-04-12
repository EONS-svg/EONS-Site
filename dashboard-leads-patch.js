/**
 * dashboard-leads-patch.js — EONS Studio (v3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Add to index.html AFTER kv-sync.js and dashboard-kv-patch.js.
 *
 * Patches the dashboard Leads and Conversations panels to pull from
 * Cloudflare KV instead of localStorage, so you see ALL leads from
 * ALL visitors regardless of what computer they used.
 *
 * Also merges any localStorage leads/convs as a fallback so nothing is lost.
 */

(function () {
  "use strict";

  const WORKER = "https://eons-api-proxy.ryanruichen03.workers.dev";

  // ── Fetch from Worker (protected) ─────────────────────────────────────────
  async function workerGet(path) {
    const pwd = window._eons_dashboard_pwd;
    if (!pwd) return null;
    try {
      const res  = await fetch(`${WORKER}${path}`, {
        headers: { "X-Dashboard-Token": pwd },
      });
      const json = await res.json();
      return json.data || null;
    } catch (err) {
      console.warn("[Dashboard Leads] Fetch failed:", path, err.message);
      return null;
    }
  }

  async function workerDelete(path) {
    const pwd = window._eons_dashboard_pwd;
    if (!pwd) return false;
    try {
      const res = await fetch(`${WORKER}${path}`, {
        method:  "DELETE",
        headers: { "X-Dashboard-Token": pwd },
      });
      return (await res.json()).ok;
    } catch { return false; }
  }

  // ── Store password for API calls ──────────────────────────────────────────
  // Grabbed when dashboard unlocks — same moment EONS_KV.unlock() is called
  window.addEventListener("load", function () {

    // Hook into the successful login to capture the password for API calls
    const _origCheckPw = window.checkPw;
    if (typeof _origCheckPw === "function") {
      window.checkPw = function () {
        const pwd = document.getElementById("dlPw")?.value || "";
        _origCheckPw.call(this);
        setTimeout(function () {
          if (window.dashAuth && pwd) {
            window._eons_dashboard_pwd = pwd;
          }
        }, 200);
      };
    }

    // ── Patch renderLeadsTable() ───────────────────────────────────────────
    const _origRenderLeads = window.renderLeadsTable;
    window.renderLeadsTable = async function () {
      const wrap = document.getElementById("leadsTable");
      if (!wrap) return;

      wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--dim);font-size:12px">Loading leads from cloud…</div>`;

      // Fetch from KV
      const kvLeads = await workerGet("/leads") || [];

      // Merge with any localStorage leads as fallback
      let localLeads = [];
      try { localLeads = JSON.parse(localStorage.getItem("eons_leads") || "[]"); } catch {}

      // Deduplicate by email — KV wins over local
      const emailsSeen = new Set(kvLeads.map(l => l.email));
      const merged = [...kvLeads, ...localLeads.filter(l => !emailsSeen.has(l.email))];

      if (!merged.length) {
        wrap.innerHTML = `<div class="dash-empty"><div class="dash-empty-icon">📭</div><div>No leads yet. Share the Studio AI link to start capturing.</div></div>`;
        return;
      }

      // Update badge
      const badge = document.getElementById("leadsbadge");
      if (badge) badge.textContent = merged.length;

      wrap.innerHTML = `
        <table class="leads-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Company</th><th>Source</th><th>Country</th><th>Date</th>
          </tr></thead>
          <tbody>
            ${merged.map(l => `
              <tr>
                <td><strong>${l.name || "—"}</strong></td>
                <td style="color:var(--mauve-d)">${l.email}</td>
                <td style="color:var(--dim)">${l.company || "—"}</td>
                <td style="color:var(--dim);font-size:10px">${l.source || "—"}</td>
                <td style="color:var(--dim);font-size:10px">${l.country || "—"}</td>
                <td style="font-size:11px;color:rgba(155,111,212,.35)">${formatDate(l.timestamp)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    };

    // ── Patch renderConvs() ────────────────────────────────────────────────
    const _origRenderConvs = window.renderConvs;
    window.renderConvs = async function () {
      const wrap = document.getElementById("convList");
      if (!wrap) return;

      wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--dim);font-size:12px">Loading conversations from cloud…</div>`;

      // Fetch index from KV
      const kvConvs = await workerGet("/convs") || [];

      // Merge with localStorage
      let localConvs = [];
      try { localConvs = window.getConvs ? window.getConvs() : []; } catch {}

      const idsSeen  = new Set(kvConvs.map(c => c.id));
      const merged   = [...kvConvs, ...localConvs.filter(c => !idsSeen.has(c.id))];

      // Apply active filter
      const filtered = window.activeFilter === "all"
        ? merged
        : merged.filter(c => c.type === window.activeFilter);

      // Update badge
      const badge = document.getElementById("convsbadge");
      if (badge) badge.textContent = merged.length;

      if (!filtered.length) {
        wrap.innerHTML = `<div class="dash-empty"><div class="dash-empty-icon">💬</div><div>${window.activeFilter === "all" ? "No conversations yet." : "None of this type."}</div></div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      filtered.forEach(conv => {
        const d    = new Date(conv.timestamp);
        const card = document.createElement("div");
        card.className = "conv-card";
        card.style.opacity = conv.read ? ".65" : "1";
        card.innerHTML = `
          <div class="conv-hdr" onclick="loadConvDetail('${conv.id}', this)">
            <div class="conv-info">
              <div class="conv-name">${conv.name}${conv.brand ? " — " + conv.brand : ""}</div>
              <div class="conv-meta">${conv.email ? conv.email + " · " : ""}${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            </div>
            <span class="conv-badge ${conv.type}">${conv.type}</span>
          </div>
          <div class="conv-body" id="cb_${conv.id}"></div>
        `;
        frag.appendChild(card);
      });
      wrap.innerHTML = "";
      wrap.appendChild(frag);
    };

    // ── Load full conversation on click ────────────────────────────────────
    window.loadConvDetail = async function (id, headerEl) {
      const body = document.getElementById(`cb_${id}`);
      if (!body) return;

      if (body.classList.contains("open")) {
        body.classList.remove("open");
        return;
      }

      body.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--dim)">Loading…</div>`;
      body.classList.add("open");

      // Try KV first, fall back to localStorage
      let conv = await workerGet(`/conv/${id}`);
      if (!conv) {
        // Fall back to localStorage
        const local = window.getConvs ? window.getConvs() : [];
        conv = local.find(c => c.id == id);
      }

      if (!conv) {
        body.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--red)">Conversation not found.</div>`;
        return;
      }

      body.innerHTML = fmtTranscriptSafe(conv.transcript);

      // Mark read in UI
      if (headerEl) {
        const card = headerEl.closest(".conv-card");
        if (card) card.style.opacity = ".65";
      }
    };

    // ── Safe transcript formatter ──────────────────────────────────────────
    function fmtTranscriptSafe(raw) {
      if (!raw) return `<div class="conv-msg"><div class="conv-msg-text">No transcript.</div></div>`;
      return raw.split("\n\n").filter(Boolean).map(b => {
        const safe = b.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (b.startsWith("USER: "))      return `<div class="conv-msg"><div class="conv-msg-role client">Client</div><div class="conv-msg-text">${safe.replace("USER: ", "")}</div></div>`;
        if (b.startsWith("ASSISTANT: ")) return `<div class="conv-msg"><div class="conv-msg-role ai">EONS AI</div><div class="conv-msg-text">${safe.replace("ASSISTANT: ", "")}</div></div>`;
        return `<div class="conv-msg"><div class="conv-msg-text">${safe}</div></div>`;
      }).join("");
    }

    // ── Patch exportLeads() to export from KV ─────────────────────────────
    const _origExportLeads = window.exportLeads;
    window.exportLeads = async function () {
      const kvLeads = await workerGet("/leads") || [];
      let localLeads = [];
      try { localLeads = JSON.parse(localStorage.getItem("eons_leads") || "[]"); } catch {}
      const emailsSeen = new Set(kvLeads.map(l => l.email));
      const merged = [...kvLeads, ...localLeads.filter(l => !emailsSeen.has(l.email))];
      if (!merged.length) { window.toast?.("No leads yet", "Share the Studio AI link."); return; }
      const csv = [
        "Name,Email,Company,Source,Country,Date",
        ...merged.map(l => `"${l.name || ""}","${l.email}","${l.company || ""}","${l.source || ""}","${l.country || ""}","${formatDate(l.timestamp)}"`)
      ].join("\n");
      const a = document.createElement("a");
      a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      a.download = "eons-leads.csv";
      a.click();
      window.toast?.("Exported!", "eons-leads.csv downloaded.");
    };

  }); // end window.addEventListener("load")

  // ── formatDate helper (mirrors your existing one) ─────────────────────────
  function formatDate(ts) {
    try { return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return "—"; }
  }

})();
