/**
 * dashboard-kv-patch.js — EONS Studio (v2 — matched to your actual index.html)
 * ─────────────────────────────────────────────────────────────────────────────
 * Load AFTER kv-sync.js, before </body>.
 *
 * Hooks into your 4 existing save functions:
 *   saveReel()       → also pushes to KV key: hero_reel
 *   savePortfolio()  → also pushes to KV key: portfolio
 *   testimonials     → pushed on every _saveTestiData() call
 *   saveSeSection()  → also pushes to KV key: site_content
 *
 * Also hooks into checkPw() to unlock KV writes when dashboard opens.
 */

(function () {
  "use strict";

  // ── Wait for your scripts to finish loading ───────────────────────────────
  window.addEventListener("load", function () {

    // ── 1. Patch checkPw to unlock KV when password is correct ───────────
    // Your checkPw() calls verifyPassword() then sets dashAuth=true.
    // We patch it to also call EONS_KV.unlock() with the raw password.
    const _origCheckPw = window.checkPw;
    if (typeof _origCheckPw === "function") {
      window.checkPw = function () {
        // Grab the password before calling the original (which clears the field on failure)
        const pwd = document.getElementById("dlPw")?.value || "";
        _origCheckPw.call(this);
        // If login succeeds, dashAuth becomes true within ~1 tick (it's async)
        setTimeout(function () {
          if (window.dashAuth && pwd) {
            window.EONS_KV.unlock(pwd);
            console.log("[Dashboard Patch] KV writes unlocked.");
          }
        }, 100);
      };
    }

    // ── 2. Patch saveReel() ───────────────────────────────────────────────
    // Your saveReel() reads DOM inputs, updates reelData, calls saveReelStore() + buildReel()
    const _origSaveReel = window.saveReel;
    if (typeof _origSaveReel === "function") {
      window.saveReel = async function () {
        _origSaveReel.call(this);  // run your existing save logic first
        // reelData is now updated — push it to KV
        await pushToKV("hero_reel", window.reelData, "💾 Save & Apply Reel");
      };
    }

    // ── 3. Patch savePortfolio() ──────────────────────────────────────────
    // Your savePortfolio() updates loadPort() data and calls buildPort()
    const _origSavePortfolio = window.savePortfolio;
    if (typeof _origSavePortfolio === "function") {
      window.savePortfolio = async function () {
        _origSavePortfolio.call(this);
        // loadPort() returns the now-updated data from localStorage
        if (typeof window.loadPort === "function") {
          const data = window.loadPort();
          await pushToKV("portfolio", data, "💾 Save & Apply Portfolio");
        }
      };
    }

    // ── 4. Patch _saveTestiData() ─────────────────────────────────────────
    // Your testimonials save to localStorage via _saveTestiData(d).
    // Every call to addTestiSlot, deleteTestiSlot, moveTestiUp/Down, updateTesti
    // goes through this function — so patching it covers all cases.
    const _origSaveTestiData = window._saveTestiData;
    if (typeof _origSaveTestiData === "function") {
      window._saveTestiData = async function (data) {
        _origSaveTestiData.call(this, data);  // your existing save to localStorage
        await pushToKV("testimonials", data, null);
      };
    }

    // ── 5. Patch saveSeSection() ──────────────────────────────────────────
    // Your saveSeSection(sectionId, keys) saves to eons_site_content in localStorage
    const _origSaveSeSection = window.saveSeSection;
    if (typeof _origSaveSeSection === "function") {
      window.saveSeSection = async function (sectionId, keys) {
        _origSaveSeSection.call(this, sectionId, keys);
        // getSiteContent() returns the now-updated object
        if (typeof window.getSiteContent === "function") {
          const content = window.getSiteContent();
          await pushToKV("site_content", content, null);
        }
      };
    }

  });

  // ── KV push helper ────────────────────────────────────────────────────────
  // Pushes data to KV. If a save button label is provided, updates it to show status.
  async function pushToKV(kvKey, data, btnLabel) {
    if (!window.EONS_KV) return;

    // Find the button to show status on (optional)
    let btn = null;
    if (btnLabel) {
      btn = Array.from(document.querySelectorAll("button"))
        .find(b => b.textContent.trim().startsWith(btnLabel.replace("💾 ", "")));
    }

    if (btn) {
      btn.disabled    = true;
      btn.textContent = "Saving to cloud…";
    }

    try {
      const ok = await window.EONS_KV.set(kvKey, data);
      if (btn) btn.textContent = ok ? "✅ Saved to Cloud" : "⚠️ Local only";
    } catch (err) {
      console.error("[Dashboard Patch] KV push failed:", err);
      if (btn) btn.textContent = "⚠️ Cloud save failed";
    } finally {
      if (btn) {
        setTimeout(function () {
          btn.disabled    = false;
          btn.textContent = btnLabel || "💾 Save";
        }, 2500);
      }
    }
  }

})();
