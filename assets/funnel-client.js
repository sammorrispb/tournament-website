/**
 * Tournament Series — UPJ funnel client (vanilla JS, no deps).
 *
 * Loaded on every page via <script defer src="/assets/funnel-client.js">.
 * Mirrors the Next.js marketing-site funnelClient.ts pattern but in plain
 * browser-globals ES5-compatible JS (no build step in this repo).
 *
 * Responsibilities:
 *   - Mint + persist `ld_visitor` cookie (UUID, 1yr, SameSite=Lax)
 *   - Adopt `?ld_pid=` cross-domain handoff on landing (spoof-guarded +
 *     URL-stripped, mirrors Hub's maybeAdoptLdPid)
 *   - trackEvent(name, props) → POSTs to same-origin /api/funnel-track proxy
 *   - Auto-fires a page_view event on load
 *   - Exposes window.LDFunnel.{trackEvent, getVisitorId, getOrCreateVisitorId}
 *     for consumers like quiz.js
 *
 * Security:
 *   - Secret never touches the browser — HMAC happens in the /api/funnel-track
 *     Node proxy.
 *   - ?ld_pid= strip via history.replaceState prevents Referer leakage.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var VISITOR_COOKIE = "ld_visitor";
  var VISITOR_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1y

  // ─── Cookie helpers ────────────────────────────────────────
  function readCookie(name) {
    try {
      var parts = document.cookie.split("; ");
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.indexOf(name + "=") === 0) {
          return decodeURIComponent(p.slice(name.length + 1));
        }
      }
    } catch (_) { /* cookies blocked */ }
    return null;
  }
  function writeCookie(name, value) {
    try {
      document.cookie =
        name + "=" + encodeURIComponent(value) +
        "; Max-Age=" + VISITOR_MAX_AGE_SEC +
        "; Path=/; SameSite=Lax";
    } catch (_) { /* cookies blocked */ }
  }

  function generateVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function getVisitorId() {
    return readCookie(VISITOR_COOKIE);
  }
  function getOrCreateVisitorId() {
    var existing = readCookie(VISITOR_COOKIE);
    if (existing) return existing;
    var id = generateVisitorId();
    writeCookie(VISITOR_COOKIE, id);
    return id;
  }

  // ─── Cross-domain ?ld_pid= adoption ─────────────────────────
  // Mirrors Hub's maybeAdoptLdPid: adopt only when no existing cookie,
  // always strip the param regardless, defend against XSS-style spoofing.
  function maybeAdoptLdPid() {
    try {
      var url = new URL(window.location.href);
      var pid = url.searchParams.get("ld_pid");
      if (!pid) return;
      var trimmed = String(pid).trim();
      if (trimmed.length > 0 && trimmed.length <= 128) {
        var existing = readCookie(VISITOR_COOKIE);
        if (!existing) {
          writeCookie(VISITOR_COOKIE, trimmed);
        }
      }
      url.searchParams.delete("ld_pid");
      var newUrl = url.pathname + (url.search ? url.search : "") + (url.hash || "");
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", newUrl);
      }
    } catch (_) { /* URL parsing / replaceState blocked */ }
  }

  // ─── Marketing-ref resolution (from URL or localStorage) ────
  // Matches the pattern used by Hub's captureUtmParams: if ?ref= present,
  // treat as utm_source; persist to localStorage for later events.
  function resolveMarketingRef() {
    try {
      var url = new URL(window.location.href);
      var ref = url.searchParams.get("ref");
      var utmSource = url.searchParams.get("utm_source");
      var candidate = ref || utmSource;
      if (candidate) {
        try { localStorage.setItem("ld_acquisition_source", candidate); } catch (_) {}
        return candidate;
      }
      try { return localStorage.getItem("ld_acquisition_source"); } catch (_) { return null; }
    } catch (_) { return null; }
  }

  // ─── trackEvent: POST to same-origin /api/funnel-track proxy ─
  function trackEvent(name, props) {
    try {
      if (!name) return;
      var visitorId = getOrCreateVisitorId();
      var marketingRef = resolveMarketingRef();
      var body = {
        event_type: name,
        visitor_id: visitorId,
        marketing_ref: marketingRef,
        properties: Object.assign({
          page_url: window.location.href,
          page_path: window.location.pathname,
        }, props || {}),
      };
      fetch("/api/funnel-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(body),
      }).catch(function () { /* never block UI */ });
    } catch (_) { /* never block UI */ }
  }

  // ─── Family-nav UTM + ld_pid stamping ──────────────────────
  // Any <a data-family-dest="linkanddink|sammorrispb|nga|mocopb"> anchor
  // gets standardized UTMs + &ld_pid=<cookie> appended at load time.
  // Mirrors the stamping pattern used by sammorrispb/nga/mocopb PR2.
  var FAMILY_BASES = {
    linkanddink: "https://linkanddink.com",
    sammorrispb: "https://sammorrispb.com",
    nga:         "https://nextgenpbacademy.com",
    mocopb:      "https://mocopb.com",
  };
  function stampFamilyLinks() {
    try {
      var anchors = document.querySelectorAll("a[data-family-dest]");
      var visitorId = getVisitorId();
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        var dest = a.getAttribute("data-family-dest");
        var base = FAMILY_BASES[dest];
        if (!base) continue;
        var url = new URL(a.getAttribute("href") || base);
        // Re-home to canonical family base if the author wrote a short href
        if (url.origin !== new URL(base).origin) {
          url = new URL(base + url.pathname + url.search + url.hash);
        }
        url.searchParams.set("utm_source", "tournaments");
        url.searchParams.set("utm_medium", "cross_family_nav");
        url.searchParams.set("utm_campaign", "family_reciprocal");
        url.searchParams.set("utm_content", "footer_" + dest);
        if (dest === "linkanddink") {
          url.searchParams.set("ref", "tournaments_footer_" + dest);
        }
        if (visitorId) url.searchParams.set("ld_pid", visitorId);
        a.setAttribute("href", url.toString());
      }
    } catch (_) { /* non-fatal */ }
  }

  // ─── Init on load ───────────────────────────────────────────
  maybeAdoptLdPid();
  getOrCreateVisitorId();

  // One page_view per page load. Fire on DOMContentLoaded so it doesn't
  // race with inline scripts that set up state (quiz.js etc).
  function firePageView() {
    trackEvent("page_view", {
      referrer: document.referrer || null,
    });
    stampFamilyLinks();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", firePageView);
  } else {
    firePageView();
  }

  // Expose public API
  window.LDFunnel = {
    trackEvent: trackEvent,
    getVisitorId: getVisitorId,
    getOrCreateVisitorId: getOrCreateVisitorId,
  };
})();
