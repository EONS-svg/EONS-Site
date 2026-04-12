/**
 * lead-conv-capture.js — EONS Studio (v3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Add to BOTH index.html and studio-ai.html before </body>.
 *
 * What this does:
 *   1. Intercepts saveConv() calls — sends conversations to KV Worker
 *   2. Intercepts lead saves — sends leads to KV Worker
 *   3. Stores a session token in sessionStorage so the visitor can
 *      retrieve their own conversation history
 *   4. Does NOT expose any other visitor's data
 */

(function () {
  "use strict";

  const WORKER = "https://eons-api-proxy.ryanruichen03.workers.dev";

  // ── Session token ─────────────────────────────────────────────────────────
  // Each visitor gets a unique session token stored in sessionStorage.
  // This lets them retrieve their own conversations but nobody else's.
  function getSessionToken() {
    let token = sessionStorage.getItem("eons_session");
    if (!token) {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      token = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem("eons_session", token);
    }
    return token;
  }

  // ── Send lead to KV ───────────────────────────────────────────────────────
  async function captureLead(leadData) {
    try {
      await fetch(`${WORKER}/lead`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    leadData.name    || "",
          email:   leadData.email   || "",
          company: leadData.company || "",
          source:  leadData.source  || "studio-ai",
        }),
      });
    } catch (err) {
      console.warn("[EONS Capture] Lead send failed:", err.message);
    }
  }

  // ── Send conversation to KV ───────────────────────────────────────────────
  async function captureConv(convData) {
    try {
      const res  = await fetch(`${WORKER}/conv`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:       convData.name       || "Anonymous",
          email:      convData.email      || "",
          brand:      convData.brand      || "",
          type:       convData.type       || "explore",
          transcript: convData.transcript || "",
          session:    getSessionToken(),
        }),
      });
      const json = await res.json();
      if (json.id) {
        // Store the conversation ID in sessionStorage so the visitor
        // can reference their own conversation history
        const myConvs = JSON.parse(sessionStorage.getItem("eons_my_convs") || "[]");
        myConvs.push(json.id);
        sessionStorage.setItem("eons_my_convs", JSON.stringify(myConvs));
      }
    } catch (err) {
      console.warn("[EONS Capture] Conversation send failed:", err.message);
    }
  }

  // ── Patch saveConv() ──────────────────────────────────────────────────────
  // Your existing saveConv() saves to localStorage for your dashboard.
  // We wrap it to ALSO send to KV so you see it from any device.
  window.addEventListener("load", function () {
    const _origSaveConv = window.saveConv;
    if (typeof _origSaveConv === "function") {
      window.saveConv = function (name, email, brand, transcript, type) {
        // Run the original (saves to localStorage)
        _origSaveConv.call(this, name, email, brand, transcript, type);
        // Also push to KV
        captureConv({ name, email, brand, transcript, type });
      };
    }

    // ── Patch lead saves ──────────────────────────────────────────────────
    // Your studio-ai.html saves leads via storeSet('eons_leads', ...).
    // We also patch any function named saveLead or submitLead if it exists,
    // and watch for lead data via a custom event dispatched from studio-ai.html.
    if (typeof window.saveLead === "function") {
      const _origSaveLead = window.saveLead;
      window.saveLead = function (lead) {
        _origSaveLead.call(this, lead);
        captureLead(lead);
      };
    }

    // Listen for the custom 'eons:lead' event dispatched by studio-ai.html
    // (we'll add this dispatch in the studio-ai patch below)
    window.addEventListener("eons:lead", function (e) {
      if (e.detail) captureLead(e.detail);
    });

    // Listen for the custom 'eons:conv' event as an alternative trigger
    window.addEventListener("eons:conv", function (e) {
      if (e.detail) captureConv(e.detail);
    });
  });

  // ── Expose helpers globally ───────────────────────────────────────────────
  // studio-ai.html can call these directly
  window.EONS_CAPTURE = {
    lead: captureLead,
    conv: captureConv,
    sessionToken: getSessionToken,
  };

})();
