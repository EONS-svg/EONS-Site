/**
 * dashboard-kv-patch.js — EONS Studio
 * ─────────────────────────────────────────────────────────────────────────────
 * Patches your existing Dashboard save buttons to write to Cloudflare KV
 * instead of (or in addition to) localStorage.
 *
 * Add this AFTER kv-sync.js and AFTER your existing dashboard script in index.html.
 *
 * It works by wrapping the existing save handlers — you don't need to rewrite
 * your dashboard logic from scratch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // Wait for DOM + kv-sync.js to be ready
  document.addEventListener("DOMContentLoaded", function () {

    // ── 1. Hook into dashboard unlock ──────────────────────────────────────
    // When the user enters the dashboard password, also unlock KV writes.
    // Finds the existing password input + submit button.

    const dashPasswordInput = document.querySelector("#dashboard-password, input[type='password']");
    const dashSubmitBtn     = document.querySelector("#dashboard-submit, .dashboard-enter-btn, [data-action='dashboard-login']");

    if (dashPasswordInput && dashSubmitBtn) {
      dashSubmitBtn.addEventListener("click", function () {
        const pwd = dashPasswordInput.value;
        if (pwd) {
          window.EONS_KV.unlock(pwd);
          console.log("[Dashboard Patch] KV writes unlocked.");
        }
      });
    }

    // ── 2. Patch "Save & Apply Reel" ──────────────────────────────────────
    patchSaveButton(
      "#save-reel-btn, [data-save='reel'], .save-reel-btn",
      "hero_reel",
      collectReelData
    );

    // ── 3. Patch "Save & Apply Portfolio" ─────────────────────────────────
    patchSaveButton(
      "#save-portfolio-btn, [data-save='portfolio'], .save-portfolio-btn",
      "portfolio",
      collectPortfolioData
    );

    // ── 4. Patch testimonial saves ─────────────────────────────────────────
    patchSaveButton(
      "#save-testimonials-btn, [data-save='testimonials'], .save-testimonials-btn",
      "testimonials",
      collectTestimonialData
    );

    // ── 5. Patch site content saves ────────────────────────────────────────
    patchSaveButton(
      "#save-content-btn, [data-save='site-content'], .save-content-btn",
      "site_content",
      collectSiteContent
    );
  });

  // ── Button patcher ─────────────────────────────────────────────────────────
  function patchSaveButton(selector, kvKey, collectFn) {
    const btn = document.querySelector(selector);
    if (!btn) {
      console.warn(`[Dashboard Patch] Save button not found: ${selector}`);
      return;
    }

    btn.addEventListener("click", async function (e) {
      // Don't prevent the existing handler — let it run first (saves to localStorage)
      // Then we also push to KV
      await new Promise(r => setTimeout(r, 50)); // let existing handler finish

      const data = collectFn();
      if (!data) return;

      btn.disabled    = true;
      btn.textContent = "Saving to cloud…";

      try {
        const success = await window.EONS_KV.set(kvKey, data);
        btn.textContent = success ? "✅ Saved" : "⚠️ Local only";
      } catch (err) {
        console.error("[Dashboard Patch] KV save error:", err);
        btn.textContent = "⚠️ Cloud save failed";
      } finally {
        setTimeout(() => {
          btn.disabled    = false;
          btn.textContent = originalLabel(kvKey);
        }, 2500);
      }
    }, { capture: true }); // capture phase so we run after existing handlers
  }

  function originalLabel(key) {
    const labels = {
      hero_reel:    "💾 Save & Apply Reel",
      portfolio:    "💾 Save & Apply Portfolio",
      testimonials: "💾 Save Testimonials",
      site_content: "💾 Save Content",
    };
    return labels[key] || "💾 Save";
  }

  // ── Data collectors ────────────────────────────────────────────────────────
  // These read the current dashboard form state and return a structured object.
  // They mirror what your existing dashboard already serialises to localStorage.

  function collectReelData() {
    // Read existing localStorage state (your dashboard already writes it there)
    const raw = localStorage.getItem("eons_hero_reel")
             || localStorage.getItem("heroReel")
             || localStorage.getItem("reel");
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }

    // Fallback: scrape the DOM inputs directly
    const urlInputs      = document.querySelectorAll(".reel-clip-url, [data-reel-url], input[name='reel-url']");
    const intervalInput  = document.querySelector(".reel-interval, [data-reel-interval], input[name='reel-interval']");
    const clips          = Array.from(urlInputs)
      .map(el => ({ url: el.value.trim() }))
      .filter(c => c.url);

    if (!clips.length) return null;

    return {
      clips,
      slideIntervalSeconds: parseInt(intervalInput?.value || "8", 10),
    };
  }

  function collectPortfolioData() {
    const raw = localStorage.getItem("eons_portfolio")
             || localStorage.getItem("portfolio");
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }

    // Fallback: scrape portfolio card inputs
    const cards = document.querySelectorAll(".portfolio-item-row, [data-portfolio-item]");
    const items = Array.from(cards).map(card => ({
      videoUrl: card.querySelector("[data-field='videoUrl'], .portfolio-video-url")?.value?.trim() || "",
      title:    card.querySelector("[data-field='title'],    .portfolio-title")?.value?.trim()    || "",
      client:   card.querySelector("[data-field='client'],   .portfolio-client")?.value?.trim()   || "",
      category: card.querySelector("[data-field='category'], .portfolio-category")?.value?.trim() || "",
    })).filter(i => i.videoUrl);

    return items.length ? { items } : null;
  }

  function collectTestimonialData() {
    const raw = localStorage.getItem("eons_testimonials")
             || localStorage.getItem("testimonials");
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }

    const rows = document.querySelectorAll(".testimonial-row, [data-testimonial]");
    const items = Array.from(rows).map(row => ({
      quote:   row.querySelector("[data-field='quote'],   .testimonial-quote")?.value?.trim()   || "",
      name:    row.querySelector("[data-field='name'],    .testimonial-name")?.value?.trim()    || "",
      role:    row.querySelector("[data-field='role'],    .testimonial-role")?.value?.trim()    || "",
      company: row.querySelector("[data-field='company'], .testimonial-company")?.value?.trim() || "",
    })).filter(i => i.quote);

    return items.length ? { items } : null;
  }

  function collectSiteContent() {
    const raw = localStorage.getItem("eons_site_content")
             || localStorage.getItem("siteContent");
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }
    return null;
  }

})();
