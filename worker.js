/**
 * Edge-Level AI Content Negotiator
 * Runtime: Tencent EdgeOne Makers (FetchEvent based - standard Edge Worker)
 *
 * Description: Dynamic SVG Open Graph Image generator with DRM and GEO (Generative
 * Engine Optimization) capabilities, featuring Tri-State Routing and KV Analytics.
 *
 * v4 fixes on top of v3:
 * 1. Fixed a broken template literal (escaped backticks) in the Cache-Control
 *    header construction — this would have thrown a syntax error at deploy time.
 * 2. Removed unused `riskScore`/`isHighRisk` dead code. The routing default
 *    (STATE 3 for anything not positively verified) already covers high-risk
 *    traffic without needing this value — kept only botClass, which IS used.
 *    If/when the real EdgeOne risk-score header is confirmed, it can be
 *    reintroduced as an explicit fast-path short-circuit into STATE 3.
 * 3. Flagged the KV Storage method signature (`get`/`put`) as UNCONFIRMED —
 *    verify against actual EdgeOne Makers KV binding API before relying on it.
 * 4. Documented the read-then-write KV increment as approximate under
 *    concurrent load (not atomic) — acceptable for demo purposes, not for
 *    billing-grade accuracy.
 */

// ---------------------------------------------------------------------------
// CONFIG — everything content/brand/secret related lives here, nowhere else.
// ---------------------------------------------------------------------------
const CONFIG = {
  // TODO(owner): confirm the correct way EdgeOne Makers exposes environment
  // variables/secrets to Edge Functions (dashboard binding name may differ).
  // This placeholder pattern fails SAFE: if unset, no signature can ever be
  // validated, so traffic falls through to STATE 3, never STATE 1.
  HMAC_SECRET: typeof EDGEONE_ENV !== "undefined" ? EDGEONE_ENV.HMAC_SECRET_KEY : "",

  // KV Storage Binding for Analytics (Section 2.7 of the guide).
  // TODO(owner): confirm the exact KV binding API EdgeOne Makers exposes.
  // `.get(key)` / `.put(key, value)` below assumes a Cloudflare-KV-style
  // signature — this is NOT yet confirmed against EdgeOne's own docs.
  KV_NAMESPACE: typeof EDGEONE_ENV !== "undefined" ? EDGEONE_ENV.NEGOTIATOR_KV : null,

  WATERMARK_TEXT_LINE_1: "This asset is copyrighted content.",
  WATERMARK_TEXT_LINE_2: "Unauthorized use for AI training is prohibited.",
  BRAND_NAME: "EdgeOne Content Negotiator Demo",

  TRUSTED_CRAWLER_UA_SUBSTRINGS: [
    "googlebot", "bingbot", "perplexitybot", "chatgpt-user", "gptbot-verified"
  ],

  CACHE_MAX_AGE_STATE_1_2: 86400,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape text for safe insertion into SVG <text> nodes. Allowlist-style: only
 *  ever used for plain display text, never for markup/attributes/URLs. */
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, tag => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[tag] || tag));
}

/** Escape text for safe embedding inside a JSON blob that will itself sit
 *  inside an HTML/SVG <script> tag. JSON.stringify alone does NOT escape
 *  "</script>", which can break out of the script context. */
function jsonForScriptTag(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Verify HMAC-SHA256 signature using Web Crypto API (constant-time via
 *  crypto.subtle.verify). Returns false on ANY failure — fails safe. */
async function verifySignature(title, signatureHex, secret) {
  if (!signatureHex || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const hexMatch = signatureHex.match(/[\da-f]{2}/gi);
    if (!hexMatch) return false;
    const sigBytes = new Uint8Array(hexMatch.map(h => parseInt(h, 16)));
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(title));
  } catch (e) {
    return false;
  }
}

/** Fallback UA-based crawler check. WEAK — a UA string can be spoofed by
 *  anyone. This is only a secondary signal, never sufficient alone to grant
 *  more trust than STATE 2 (which is itself never the fast-cost-saving lane). */
function isLikelyVerifiedCrawlerByUA(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  return CONFIG.TRUSTED_CRAWLER_UA_SUBSTRINGS.some(sub => ua.includes(sub));
}

/** Increment state counter in KV (non-blocking via event.waitUntil).
 *  NOTE: this is a read-then-write increment, not atomic — under concurrent
 *  load a small number of increments can be lost. Fine for demo purposes,
 *  not intended as billing-grade precision. */
async function recordAnalytics(state) {
  if (!CONFIG.KV_NAMESPACE) return;
  const key = `count:state${state}`;
  try {
    const current = await CONFIG.KV_NAMESPACE.get(key);
    let count = current ? parseInt(current, 10) : 0;
    if (isNaN(count)) count = 0;
    await CONFIG.KV_NAMESPACE.put(key, (count + 1).toString());
  } catch (err) {
    // Silently fail if KV fails, don't crash the Edge Function
    console.error("KV Increment Error:", err);
  }
}

// ---------------------------------------------------------------------------
// STATE 1 — Clean SVG (only reachable via valid HMAC)
// ---------------------------------------------------------------------------
function renderCleanSVG(title) {
  const safeTitle = escapeHTML(title || "Dynamic EdgeOne Card");

  // Mascot: strictly TWO parallel vertical lines on the forehead, flanked by
  // TWO small oval strokes.
  const catFaceSVG = `
    <g transform="translate(350, 120) scale(1.5)">
      <path d="M50,150 C50,200 150,200 150,150 C150,100 180,50 150,50 C120,50 110,80 100,80 C90,80 80,50 50,50 C20,50 50,100 50,150 Z" fill="#2d3748" />
      <g transform="translate(0, -10)" fill="#a0aec0">
        <ellipse cx="78" cy="70" rx="3" ry="10" transform="rotate(-15 78 70)" />
        <rect x="90" y="60" width="4" height="20" rx="2" />
        <rect x="106" y="60" width="4" height="20" rx="2" />
        <ellipse cx="122" cy="70" rx="3" ry="10" transform="rotate(15 122 70)" />
      </g>
      <circle cx="80" cy="110" r="10" fill="#ecc94b" />
      <circle cx="120" cy="110" r="10" fill="#ecc94b" />
      <ellipse cx="80" cy="110" rx="2" ry="6" fill="#1a202c" />
      <ellipse cx="120" cy="110" rx="2" ry="6" fill="#1a202c" />
      <path d="M95,130 L105,130 L100,135 Z" fill="#fc8181" />
    </g>
  `;

  return `
    <svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1a202c" />
          <stop offset="100%" stop-color="#4a5568" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill="url(#bg)" />
      <rect x="40" y="40" width="720" height="320" fill="rgba(255,255,255,0.05)" rx="20" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
      <text x="80" y="200" font-family="system-ui, sans-serif" font-size="42" font-weight="bold" fill="#fff">${safeTitle}</text>
      <text x="80" y="250" font-family="system-ui, sans-serif" font-size="24" fill="#cbd5e0">${escapeHTML(CONFIG.BRAND_NAME)}</text>
      ${catFaceSVG}
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// STATE 2 — Semantic SVG for verified crawlers / AI answer engines (GEO Mode)
// ---------------------------------------------------------------------------
function renderSemanticSVG(title) {
  const safeTitle = escapeHTML(title || "Dynamic EdgeOne Card");

  const jsonLD = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "name": safeTitle,
    "description": "GEO-optimized Open Graph image for " + safeTitle,
    "creator": { "@type": "Organization", "name": CONFIG.BRAND_NAME }
  };

  return `
    <svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
      <script type="application/ld+json">${jsonForScriptTag(jsonLD)}</script>
      <rect width="800" height="400" fill="#f7fafc" />
      <text x="400" y="200" font-family="system-ui, sans-serif" font-size="32" font-weight="bold" fill="#2d3748" text-anchor="middle">${safeTitle}</text>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// STATE 3 — PR Watermark SVG (default for everyone not positively verified)
// ---------------------------------------------------------------------------
function renderPRWatermarkSVG() {
  return `
    <svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
      <filter id="degrade"><feGaussianBlur stdDeviation="3" /></filter>
      <rect width="800" height="400" fill="#111" />
      <rect width="780" height="380" x="10" y="10" fill="none" stroke="#e53e3e" stroke-width="10" filter="url(#degrade)" />
      <text x="400" y="180" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="#e53e3e" text-anchor="middle" dominant-baseline="middle">
        ${escapeHTML(CONFIG.WATERMARK_TEXT_LINE_1)}
      </text>
      <text x="400" y="230" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="#e53e3e" text-anchor="middle" dominant-baseline="middle">
        ${escapeHTML(CONFIG.WATERMARK_TEXT_LINE_2)}
      </text>
    </svg>
  `;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);

  // Dedicated endpoint: analytics stats (used for "Business Checkmate").
  if (url.pathname === "/api/og/stats" && request.method === "GET") {
    const stats = { state1: 0, state2: 0, state3: 0 };
    if (CONFIG.KV_NAMESPACE) {
      try {
        stats.state1 = parseInt((await CONFIG.KV_NAMESPACE.get("count:state1")) || "0", 10);
        stats.state2 = parseInt((await CONFIG.KV_NAMESPACE.get("count:state2")) || "0", 10);
        stats.state3 = parseInt((await CONFIG.KV_NAMESPACE.get("count:state3")) || "0", 10);
      } catch (e) {
        // Fallback gracefully on KV failure — zeros are still a valid response.
      }
    }
    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // Dedicated endpoint: demo-auth (Generates a valid signature for the Demo frontend)
  // WARNING: In a real production scenario, signing must never happen at the edge publicly.
  if (url.pathname === "/api/og/demo-auth" && request.method === "GET") {
    try {
      const demoTitle = "Demo Citizen";
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(CONFIG.HMAC_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(demoTitle));
      const hexSignature = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
      return new Response(JSON.stringify({ title: demoTitle, signature: hexSignature }), {
        status: 200, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response("Auth generation failed", { status: 500 });
    }
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const title = url.searchParams.get("title") || "";
  const signature = url.searchParams.get("signature") || "";

  // Bonus signal from EdgeOne native Bot Management — UNCONFIRMED header
  // name, treated as optional enrichment only, never a gate to STATE 1.
  const botClass = (request.headers.get("X-EdgeOne-Bot-Class") || "").toLowerCase();
  const nativeSaysVerifiedBot = botClass === "verifiedbot";

  const baseHeaders = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": `public, max-age=${CONFIG.CACHE_MAX_AGE_STATE_1_2}, s-maxage=${CONFIG.CACHE_MAX_AGE_STATE_1_2}`,
    "Access-Control-Allow-Origin": "*"
  };

  // ---- STATE 1: the ONLY way in is a positively valid HMAC signature. ----
  const isValidHMAC = await verifySignature(title, signature, CONFIG.HMAC_SECRET);
  if (isValidHMAC) {
    if (event.waitUntil) event.waitUntil(recordAnalytics(1));
    return new Response(renderCleanSVG(title), {
      status: 200,
      headers: { ...baseHeaders, "X-Content-Negotiator-State": "1" },
    });
  }

  // ---- STATE 2: verified crawler / AI answer engine (GEO Mode). ----
  const isDemoCrawler = url.pathname === "/api/og/demo" && url.searchParams.get("simulate") === "crawler";
  const isVerifiedCrawler = isDemoCrawler || nativeSaysVerifiedBot || isLikelyVerifiedCrawlerByUA(request);
  if (isVerifiedCrawler) {
    if (event.waitUntil) event.waitUntil(recordAnalytics(2));
    return new Response(renderSemanticSVG(title), {
      status: 200,
      headers: { ...baseHeaders, "X-Content-Negotiator-State": "2" },
    });
  }

  // ---- STATE 3: everyone else — DEFAULT, not an edge case. ----
  // This covers: no signature, invalid signature, and any unrecognized bot.
  if (event.waitUntil) event.waitUntil(recordAnalytics(3));
  return new Response(renderPRWatermarkSVG(), {
    status: 200, // never 403 — force ingestion of the watermark
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Negotiator-State": "3",
      "Access-Control-Allow-Origin": "*"
    },
  });
}