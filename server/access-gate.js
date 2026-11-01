const crypto = require("node:crypto");


const parseCookies = (header) => {
  const raw = typeof header === "string" ? header : "";
  if (!raw.trim()) return {};
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

/** Constant-time string comparison to prevent timing attacks. */
const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to burn constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

/** Simple in-memory rate limiter for auth attempts. */
const createRateLimiter = (maxAttempts = 10, windowMs = 60_000) => {
  const attempts = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now - entry.start > windowMs) attempts.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return {
    isLimited(ip) {
      const entry = attempts.get(ip);
      if (!entry) return false;
      return entry.count >= maxAttempts;
    },
    recordFailure(ip) {
      const now = Date.now();
      const entry = attempts.get(ip);
      if (!entry || now - entry.start > windowMs) {
        attempts.set(ip, { count: 1, start: now });
        return;
      }
      entry.count++;
    },
    reset(ip) {
      attempts.delete(ip);
    },
  };
};

/**
 * Resolve client IP for rate limiting.
 * When TRUSTED_PROXY=1 is set, the first value of X-Forwarded-For is used.
 * Only set TRUSTED_PROXY=1 when this server sits behind a reverse proxy that
 * you control (nginx, Caddy, Vercel edge). Without it, X-Forwarded-For is
 * ignored to prevent spoofing by direct clients.
 */
const resolveClientIp = (req) => {
  if (process.env.TRUSTED_PROXY === "1") {
    const forwarded = req.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress || "unknown";
};

function createAccessGate(options) {
  const token = String(options?.token ?? "").trim();
  const cookieName = String(options?.cookieName ?? "studio_access").trim() || "studio_access";

  const enabled = Boolean(token);
  const rateLimiter = createRateLimiter(10, 60_000);

  const getAuthState = (req) => {
    if (!enabled) return { authorized: true, limited: false };
    const ip = resolveClientIp(req);
    const cookieHeader = req.headers?.cookie;
    const cookies = parseCookies(cookieHeader);
    const authorized = safeCompare(cookies[cookieName] || "", token);
    if (authorized) {
      rateLimiter.reset(ip);
      return { authorized: true, limited: false };
    }
    if (rateLimiter.isLimited(ip)) {
      return { authorized: false, limited: true };
    }
    rateLimiter.recordFailure(ip);
    return { authorized: false, limited: rateLimiter.isLimited(ip) };
  };

  const loginPage = (failed) => `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Masuk · ShariaGuard SGRC</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1410;color:#e8efe9;font-family:system-ui,sans-serif}
form{width:min(360px,90vw);padding:28px;border:1px solid #2c4a3a;border-radius:12px;background:#11201a}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 18px;color:#9db5a6;font-size:13px}
input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #2c4a3a;background:#0b1410;color:#e8efe9;font-size:15px}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#c9a227;color:#111;font-weight:600;font-size:15px;cursor:pointer}
.err{color:#ff8a80;font-size:13px;margin-top:10px}</style></head>
<body><form method="post" action="/__login"><h1>ShariaGuard SGRC · Kantor AI</h1><p>Masukkan kode akses kantor.</p>
<input type="password" name="key" autofocus autocomplete="current-password" placeholder="Kode akses">
<button type="submit">Masuk</button>${failed ? '<div class="err">Kode akses salah.</div>' : ""}</form></body></html>`;

  const handleLogin = (req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) req.destroy();
    });
    req.on("end", () => {
      const ip = resolveClientIp(req);
      const key = new URLSearchParams(body).get("key") || "";
      if (rateLimiter.isLimited(ip)) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Terlalu banyak percobaan. Tunggu satu menit.");
        return;
      }
      if (safeCompare(key, token)) {
        rateLimiter.reset(ip);
        const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
        res.statusCode = 303;
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
        );
        res.setHeader("Location", "/office");
        res.end();
        return;
      }
      rateLimiter.recordFailure(ip);
      res.statusCode = 401;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(loginPage(true));
    });
  };

  const handleHttp = (req, res) => {
    if (!enabled) return false;
    if (req.method === "POST" && String(req.url || "").split("?")[0] === "/__login") {
      handleLogin(req, res);
      return true;
    }
    const auth = getAuthState(req);
    if (!auth.authorized) {
      const statusCode = auth.limited ? 429 : 401;
      if (String(req.url || "/").startsWith("/api/")) {
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: auth.limited
              ? "Too many failed studio access attempts. Wait a minute and retry."
              : "Studio access token required. Send the configured Studio access cookie and retry.",
          })
        );
      } else {
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(loginPage(false));
      }
      return true;
    }
    return false;
  };

  const allowUpgrade = (req) => {
    if (!enabled) return true;
    return getAuthState(req).authorized;
  };

  return { enabled, handleHttp, allowUpgrade };
}

module.exports = { createAccessGate };
