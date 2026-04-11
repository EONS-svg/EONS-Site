/**
 * kv-sync.js — EONS Studio (v2 — matched to your actual index.html)
 * ─────────────────────────────────────────────────────────────────
 * Load BEFORE the closing </body> tag, before dashboard-kv-patch.js.
 *
 * What this does:
 *   1. On page load: fetches hero reel, portfolio, testimonials from
 *      Cloudflare KV and writes them into localStorage under the EXACT
 *      keys your existing code already reads (eons_reel, eons_portfolio,
 *      eons_testimonials). Then calls your existing render functions
 *      so every visitor sees the same content.
 *   2. Exposes window.EONS_KV.set() for dashboard-kv-patch.js to call
 *      after each save button click.
 */

(function () {
  "use strict";

  const WORKER = "https://eons-api-proxy.ryanruichen03.workers.dev";

  // Exact keys your existing code uses in localStorage
  const KV_MAP = {
    hero_reel:    "eons_reel",          // storeGet('eons_reel')
    portfolio:    "eons_portfolio",     // storeGet('eons_portfolio')
    testimonials: "eons_testimonials",  // localStorage.getItem(TESTI_KEY)
    site_content: "eons_site_content",  // storeGet('eons_site_content')
  };

  // Raw password stored here when dashboard unlocks
  let _sessionPwd = null;

  // ── Public API ────────────────────────────────────────────────────────────

  async function kvGet(kvKey) {
    try {
      const res  = await fetch(`${WORKER}/kv/${kvKey}`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      return json.data ?? null;
    } catch (err) {
      console.warn("[EONS KV] Read failed for", kvKey, err.message);
      return null;
    }
  }

  async function kvSet(kvKey, value) {
    if (!_sessionPwd) {
      console.warn("[EONS KV] Not authenticated — localStorage only.");
      return false;
    }
    try {
      const res = await fetch(`${WORKER}/kv/${kvKey}`, {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "X-Dashboard-Token": _sessionPwd,
        },
        body: JSON.stringify({ data: value }),
      });
      const json = await res.json();
      return !!json.ok;
    } catch (err) {
      console.error("[EONS KV] Write failed for", kvKey, err.message);
      return false;
    }
  }

  function kvUnlock(pwd) {
    _sessionPwd = pwd;
  }

  function kvLock() {
    _sessionPwd = null;
  }

  window.EONS_KV = { get: kvGet, set: kvSet, unlock: kvUnlock, lock: kvLock };

  // ── On page load: pull KV → localStorage → re-render ────────────────────

  async function syncFromKV() {
    // ── Hero Reel ─────────────────────────────────────────────────────────
    const reelData = await kvGet("hero_reel");
    if (reelData && reelData.clips && reelData.clips.length) {
      // Write into localStorage so your existing loadReel() picks it up
      try { localStorage.setItem("eons_reel", JSON.stringify(reelData)); } catch {}
      // Re-run your existing reel builder if it's already loaded
      if (typeof window.buildReel === "function") {
        // Update the global reelData object your code uses
        if (typeof window.reelData !== "undefined") {
          window.reelData = reelData;
        }
        window.buildReel();
      }
    }

    // ── Portfolio ─────────────────────────────────────────────────────────
    const portData = await kvGet("portfolio");
    if (portData && Array.isArray(portData) && portData.length) {
      try { localStorage.setItem("eons_portfolio", JSON.stringify(portData)); } catch {}
      if (typeof window.buildPort === "function") {
        window.buildPort(portData);
      }
    }

    // ── Testimonials ──────────────────────────────────────────────────────
    const testiData = await kvGet("testimonials");
    if (testiData && Array.isArray(testiData) && testiData.length) {
      try { localStorage.setItem("eons_testimonials", JSON.stringify(testiData)); } catch {}
      // _applyTestis is your existing function that rebuilds the slideshow DOM
      if (typeof window._applyTestis === "function") {
        window._applyTestis(testiData);
      }
    }

    // ── Site Content ──────────────────────────────────────────────────────
    const contentData = await kvGet("site_content");
    if (contentData && typeof contentData === "object") {
      try { localStorage.setItem("eons_site_content", JSON.stringify(contentData)); } catch {}
      if (typeof window.applySiteContent === "function") {
        window.applySiteContent(contentData);
      }
    }
  }

  // Run sync after DOM is ready and your existing scripts have initialised
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(syncFromKV, 200));
  } else {
    setTimeout(syncFromKV, 200);
  }

})();
