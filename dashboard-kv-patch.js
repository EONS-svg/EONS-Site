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

    // ── 1. Unlock KV when dashboard password is correct ──────────────────
    // Strategy: listen on the password input for Enter key AND on the
    // login button for clicks. Capture the raw password BEFORE checkPw
    // clears the field, then poll for dashAuth becoming true.
    function setupKVUnlock() {
      const pwInput = document.getElementById("dlPw");
      const loginBtn = document.querySelector(".dash-login .dash-save");

      function captureAndUnlock() {
        const pwd = pwInput?.value || "";
        if (!pwd) return;
        // Poll every 50ms for up to 2s waiting for dashAuth to go true
        let attempts = 0;
        const poll = setInterval(function () {
          attempts++;
          if (window.dashAuth) {
            clearInterval(poll);
            window.EONS_KV.unlock(pwd);
            console.log("[Dashboard Patch] KV writes unlocked.");
          }
          if (attempts > 40) clearInterval(poll); // give up after 2s
        }, 50);
      }

      if (pwInput)  pwInput.addEventListener("keydown",  function(e){ if(e.key==="Enter") captureAndUnlock(); });
      if (loginBtn) loginBtn.addEventListener("click", captureAndUnlock);
    }
    setupKVUnlock();

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
