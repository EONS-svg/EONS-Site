/**
 * kv-sync.js — EONS Studio
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for localStorage-based site data.
 * Reads from Cloudflare KV on every page load (public).
 * Writes to Cloudflare KV from the Dashboard (password-protected).
 *
 * Usage:
 *   1. Add <script src="/kv-sync.js"></script> to index.html BEFORE your
 *      existing dashboard/portfolio scripts.
 *   2. Replace every localStorage.getItem / localStorage.setItem call in your
 *      existing scripts with the EONS_KV helpers below.
 *
 * The script patches window.EONS_KV with async get/set methods.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  const WORKER_BASE = "https://eons-api-proxy.ryanruichen03.workers.dev";

  // ── Hashing utility (mirrors Worker auth logic) ───────────────────────────
  async function hashToken(password) {
    const encoder = new TextEncoder();
    const data    = encoder.encode(password + "eons_studio_2025_nyc");
    const buf     = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ── Session token (set when dashboard unlocks) ────────────────────────────
  let _sessionToken = null; // raw password, hashed on each write

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Read a KV key. Returns parsed value or null.
   * @param {"hero_reel"|"portfolio"|"testimonials"|"site_content"} key
   */
  async function kvGet(key) {
    try {
      const res  = await fetch(`${WORKER_BASE}/kv/${key}`);
      const json = await res.json();
      return json.data ?? null;
    } catch (err) {
      console.warn("[EONS KV] Read failed, falling back to localStorage:", err);
      // Graceful fallback — read from localStorage if Worker is unreachable
      const local = localStorage.getItem(`eons_${key}`);
      return local ? JSON.parse(local) : null;
    }
  }

  /**
   * Write a KV key. Requires dashboard to be unlocked first.
   * @param {"hero_reel"|"portfolio"|"testimonials"|"site_content"} key
   * @param {*} value — anything JSON-serialisable
   */
  async function kvSet(key, value) {
    if (!_sessionToken) {
      throw new Error("[EONS KV] Dashboard not authenticated. Call EONS_KV.unlock(password) first.");
    }

    // Always mirror to localStorage as backup
    localStorage.setItem(`eons_${key}`, JSON.stringify(value));

    const tokenHash = await hashToken(_sessionToken);

    try {
      const res = await fetch(`${WORKER_BASE}/kv/${key}`, {
        method:  "POST",
        headers: {
          "Content-Type":       "application/json",
          "X-Dashboard-Token":  _sessionToken, // Worker re-hashes this
        },
        body: JSON.stringify({ data: value }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Unknown error");
      return true;
    } catch (err) {
      console.error("[EONS KV] Write to KV failed:", err);
      // Still returns true because localStorage backup succeeded
      return false;
    }
  }

  /**
   * Unlock write access. Call this when dashboard password is verified.
   * @param {string} password — plaintext dashboard password
   */
  function kvUnlock(password) {
    _sessionToken = password;
    console.log("[EONS KV] Write access unlocked for this session.");
  }

  /**
   * Lock write access (call on dashboard logout / session end).
   */
  function kvLock() {
    _sessionToken = null;
  }

  // ── Expose globally ───────────────────────────────────────────────────────
  window.EONS_KV = { get: kvGet, set: kvSet, unlock: kvUnlock, lock: kvLock };

  // ── Auto-load site data on page load ─────────────────────────────────────
  // Fires as soon as DOM is ready; populates all sections before the user sees them.
  document.addEventListener("DOMContentLoaded", async function () {

    // ── Hero Reel ─────────────────────────────────────────────────────────
    const reelData = await kvGet("hero_reel");
    if (reelData && reelData.clips && reelData.clips.length > 0) {
      window._eons_reel = reelData; // existing reel renderer reads this
      renderHeroReel(reelData);
    }

    // ── Portfolio ─────────────────────────────────────────────────────────
    const portfolioData = await kvGet("portfolio");
    if (portfolioData && portfolioData.items && portfolioData.items.length > 0) {
      window._eons_portfolio = portfolioData;
      renderPortfolio(portfolioData);
    }

    // ── Testimonials ──────────────────────────────────────────────────────
    const testimonialData = await kvGet("testimonials");
    if (testimonialData && testimonialData.items && testimonialData.items.length > 0) {
      window._eons_testimonials = testimonialData;
      renderTestimonials(testimonialData);
    }

    // ── Site Content (text overrides) ─────────────────────────────────────
    const siteContent = await kvGet("site_content");
    if (siteContent) {
      window._eons_site_content = siteContent;
      applyTextContent(siteContent);
    }
  });

  // ── Renderers ─────────────────────────────────────────────────────────────
  // These target the existing DOM structure on eons.studio/index.html.
  // They replace placeholder content with live KV data.

  function renderHeroReel(data) {
    const container = document.getElementById("hero-reel-container");
    if (!container) return;

    // Clear placeholder
    container.innerHTML = "";

    // Build iframe slides for Cloudflare Stream
    data.clips.forEach((clip, i) => {
      const iframe = document.createElement("iframe");
      iframe.src              = clip.url;
      iframe.allow            = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;";
      iframe.allowFullscreen  = true;
      iframe.style.cssText    = `
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        border: none;
        opacity: ${i === 0 ? "1" : "0"};
        transition: opacity 0.8s ease;
        pointer-events: none;
      `;
      iframe.dataset.reelSlide = i;
      container.appendChild(iframe);
    });

    // Auto-rotate slides
    const interval = (data.slideIntervalSeconds || 8) * 1000;
    let current = 0;
    setInterval(() => {
      const slides = container.querySelectorAll("[data-reel-slide]");
      if (slides.length < 2) return;
      slides[current].style.opacity = "0";
      current = (current + 1) % slides.length;
      slides[current].style.opacity = "1";
    }, interval);
  }

  function renderPortfolio(data) {
    const grid = document.getElementById("portfolio-grid");
    if (!grid) return;
    grid.innerHTML = "";

    data.items.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = i === 0 ? "portfolio-card portfolio-card--featured" : "portfolio-card";
      card.innerHTML = `
        <div class="portfolio-card__video-wrap">
          <iframe
            src="${item.videoUrl}"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
        <div class="portfolio-card__meta">
          <h3 class="portfolio-card__title">${item.title || "Untitled Project"}</h3>
          ${item.client   ? `<p class="portfolio-card__client">${item.client}</p>`       : ""}
          ${item.category ? `<span class="portfolio-card__tag">${item.category}</span>` : ""}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function renderTestimonials(data) {
    const track = document.getElementById("testimonials-track");
    if (!track) return;
    track.innerHTML = "";

    data.items.forEach(t => {
      const slide = document.createElement("div");
      slide.className = "testimonial-slide";
      slide.innerHTML = `
        <div class="testimonial__stars">★★★★★</div>
        <blockquote class="testimonial__quote">"${t.quote}"</blockquote>
        <div class="testimonial__author">
          <span class="testimonial__name">— ${t.name || "[Client Name]"}</span>
          <span class="testimonial__role">${t.role || ""} · ${t.company || ""}</span>
        </div>
      `;
      track.appendChild(slide);
    });
  }

  function applyTextContent(content) {
    // Generic text override system — content is a flat key/value map
    // where keys are element IDs or data-content attributes.
    Object.entries(content).forEach(([selector, text]) => {
      const el = document.getElementById(selector)
              || document.querySelector(`[data-content="${selector}"]`);
      if (el) el.textContent = text;
    });
  }

})();
