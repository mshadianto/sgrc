"use strict";

// ShariaGuard SGRC Gateway Adapter
// Runtime agen Kantor AI SGRC yang berbicara protokol gateway Hermes3D (v3).
// Agen: Mudir (koordinator), Haris (Sharia Risk Manager), Multazim (Kepatuhan),
// Raqib (Asisten DPS), Muhasib (Auditor Syariah Intern).
// LLM: OpenAI-compatible (SumoPod) via server/sgrc/llm.js. Tanpa API key → mode demo.

try {
  process.loadEnvFile?.(); // baca .env di folder kerja bila ada (Node 20.12+)
} catch {}

const http = require("http");
const { randomUUID } = require("crypto");
const { WebSocketServer } = require("ws");

const { AGENTS, buildSystemPrompt } = require("./sgrc/agents");
const { redact, AuditChain, sha } = require("./sgrc/guard");
const llm = require("./sgrc/llm");

const ADAPTER_PORT = parseInt(process.env.SGRC_ADAPTER_PORT || process.env.HERMES_ADAPTER_PORT || "18789", 10);
const ADAPTER_HOST = process.env.SGRC_ADAPTER_HOST || "127.0.0.1";
const GATEWAY_TOKEN = process.env.SGRC_GATEWAY_TOKEN || "";
const MAIN_KEY = "main";
const DEFAULT_ID = "sgrc-mudir";
const MAX_HISTORY = 16;
const TENANT = {
  name: process.env.SGRC_TENANT_NAME || "BPRS Demo",
  tier: process.env.SGRC_TENANT_TIER || "",
};
const APPROVAL_FOOTER =
  "\n\n---\n⚖️ *DRAF AI — bukan opini hukum maupun opini syariah. Keputusan dan tanda tangan tetap pada pejabat berwenang.*";

const MODELS = [
  { id: llm.MODEL, name: `${llm.MODEL} (SumoPod)`, provider: "sumopod" },
];

const agents = new Map(AGENTS.map((a) => [a.id, { ...a, workspace: `/sgrc/${a.id}` }]));
const files = new Map();
const sessionSettings = new Map();
const conversationHistory = new Map();
const activeRuns = new Map();
const activeSendEventFns = new Set();
const audit = new AuditChain();

const randomId = () => randomUUID().replace(/-/g, "");
const sessionKeyFor = (agentId) => `agent:${agentId}:${MAIN_KEY}`;
const agentIdFromKey = (key) => (typeof key === "string" && key.startsWith("agent:") ? key.split(":")[1] : DEFAULT_ID);

function getHistory(sessionKey) {
  if (!conversationHistory.has(sessionKey)) conversationHistory.set(sessionKey, []);
  return conversationHistory.get(sessionKey);
}

const resOk = (id, payload) => ({ type: "res", id, ok: true, payload: payload ?? {} });
const resErr = (id, code, message) => ({ type: "res", id, ok: false, error: { code, message } });

function broadcastEvent(frame) {
  for (const send of activeSendEventFns) {
    try {
      send(frame);
    } catch {}
  }
}

function agentListPayload() {
  return [...agents.values()].map((agent) => ({
    id: agent.id,
    name: agent.name,
    workspace: agent.workspace,
    identity: { name: agent.name, emoji: agent.emoji || "🤖" },
    role: agent.role,
  }));
}

function presenceFrame(sessionKey, agentId) {
  const entry = { key: sessionKey, updatedAt: Date.now() };
  return {
    type: "event",
    event: "presence",
    payload: { sessions: { recent: [entry], byAgent: [{ agentId, recent: [entry] }] } },
  };
}

// ---------- Routing Mudir ----------

const ROUTES = [
  { id: "sgrc-muhasib", re: /\b(audit|auditor|temuan|5c|program audit|uji populasi|tindak lanjut temuan|kertas kerja|pkpt)\b/i },
  { id: "sgrc-raqib", re: /\b(dps|opini|fatwa|rapat dps|risalah|laporan hasil pengawasan|khilaf|dsn|majelis)\b/i },
  { id: "sgrc-multazim", re: /\b(kepatuhan|sop|kebijakan|promosi|brosur|gap analysis|komitmen ojk|pelatihan|dana non.?halal|zakat|bagi hasil)\b/i },
  { id: "sgrc-haris", re: /\b(risiko|risk|sncr|kri|heatmap|limit|appetite|profil risiko|produk baru|mitigasi)\b/i },
];

function keywordRoute(message) {
  for (const r of ROUTES) if (r.re.test(message)) return r.id;
  return DEFAULT_ID;
}

async function routeMessage(message, signal) {
  const fallback = keywordRoute(message);
  if (!llm.isLive()) return fallback;
  try {
    const answer = await llm.completeOnce({
      signal,
      system:
        "Anda router kantor SGRC. Pilih SATU kata saja: haris (risiko syariah, SNCR, KRI, produk baru), multazim (kepatuhan, kebijakan, SOP, promosi, OJK), raqib (DPS, opini syariah, fatwa, rapat DPS, laporan DPS), muhasib (audit intern, temuan, program audit), mudir (sapaan, umum, koordinasi lintas fungsi, kalender).",
      user: message.slice(0, 1500),
    });
    const word = answer.toLowerCase().match(/haris|multazim|raqib|muhasib|mudir/);
    return word ? `sgrc-${word[0]}` : fallback;
  } catch {
    return fallback;
  }
}

// ---------- Demo reply (tanpa API key) ----------

function demoReply(agent, message) {
  const fokus = message.replace(/\s+/g, " ").slice(0, 180);
  const langkah = {
    "sgrc-mudir": "memetakan permintaan ke fungsi yang tepat, mengecek kalender kepatuhan, dan merangkum hasil kerja tim.",
    "sgrc-haris": "memperbarui SNCR register, menilai risiko inheren/residual, dan mengusulkan mitigasi beserta pemilik dan tenggat.",
    "sgrc-multazim": "menyusun gap analysis terhadap fatwa DSN-MUI dan POJK 25/2024, lalu checklist kepatuhan per ketentuan.",
    "sgrc-raqib": "menyusun draf opini terstruktur (fakta → rujukan → analisis → opini → syarat) untuk diputuskan DPS.",
    "sgrc-muhasib": "menyusun program audit per akad dan draf temuan format 5C, dengan menjaga independensi lini ketiga.",
  }[agent.id];
  return `**${agent.name} · ${agent.role}** (${agent.floor})\n\nPermintaan diterima: “${fokus}”.\n\nSaya akan ${langkah}\n\n_Mode demo: mesin AI (SumoPod) belum dikonfigurasi, jadi ini jawaban contoh. Isi \`SGRC_LLM_API_KEY\` untuk jawaban sungguhan._\n\n**Tindak lanjut:** ${agent.owner}.`;
}

// ---------- Eksekusi satu agen ----------

async function runAgent({ agent, sessionKey, message, runId, sendEvent, isAborted, controller, requestedBy }) {
  let seq = 0;
  const emitChat = (state, extra) =>
    sendEvent({ type: "event", event: "chat", seq: seq++, payload: { runId, sessionKey, state, ...extra } });

  const { text: safeMessage, hits } = redact(message);
  audit.append({
    action: "task.start",
    agent: agent.id,
    runId,
    requestedBy: requestedBy || "user",
    inputHash: sha(message),
    redactions: hits,
  });

  const history = getHistory(sessionKey);
  let reply;
  if (llm.isLive()) {
    try {
      const settings = sessionSettings.get(sessionKey) || {};
      reply = await llm.streamChat({
        system: buildSystemPrompt(agent, TENANT),
        model: settings.model,
        messages: [...history.slice(-MAX_HISTORY), { role: "user", content: safeMessage }],
        signal: controller.signal,
        onDelta: (partial) => {
          if (!isAborted()) emitChat("delta", { message: { role: "assistant", content: partial } });
        },
      });
    } catch (error) {
      if (isAborted()) {
        emitChat("aborted", {});
        audit.append({ action: "task.aborted", agent: agent.id, runId });
        return null;
      }
      reply = `Maaf, mesin AI sedang tidak dapat dihubungi (${error.message}). Silakan coba lagi.`;
    }
  } else {
    reply = demoReply(agent, safeMessage);
    let partial = "";
    for (const word of reply.split(" ")) {
      if (isAborted()) break;
      partial = partial ? `${partial} ${word}` : word;
      emitChat("delta", { message: { role: "assistant", content: partial } });
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  if (isAborted()) {
    emitChat("aborted", {});
    audit.append({ action: "task.aborted", agent: agent.id, runId });
    return null;
  }

  const finalText = reply + APPROVAL_FOOTER;
  history.push({ role: "user", content: safeMessage });
  history.push({ role: "assistant", content: reply });
  if (history.length > MAX_HISTORY * 2) history.splice(0, history.length - MAX_HISTORY * 2);

  emitChat("final", { stopReason: "end_turn", message: { role: "assistant", content: finalText } });
  sendEvent(presenceFrame(sessionKey, agent.id));
  audit.append({ action: "draft.ready", agent: agent.id, runId, outputHash: sha(reply), status: "menunggu-persetujuan-manusia" });
  return reply;
}

// ---------- Protokol gateway ----------

async function handleMethod(method, params, id, sendEvent) {
  const p = params || {};

  switch (method) {
    case "agents.list":
      return resOk(id, { defaultId: DEFAULT_ID, mainKey: MAIN_KEY, agents: agentListPayload() });

    case "agents.create":
    case "agents.delete":
      return resErr(id, "unsupported_method", "Struktur kantor SGRC ditetapkan oleh konfigurasi tier, bukan dari UI.");

    case "agents.update": {
      const agent = agents.get(typeof p.agentId === "string" ? p.agentId.trim() : "");
      if (!agent) return resErr(id, "not_found", `Agen ${p.agentId} tidak ditemukan`);
      if (typeof p.name === "string" && p.name.trim()) agent.name = p.name.trim();
      return resOk(id, { ok: true, removedBindings: 0 });
    }

    case "agents.files.get": {
      const agentId = p.agentId || DEFAULT_ID;
      const key = `${agentId}/${p.name || ""}`;
      if (!files.has(key) && /^(SOUL|AGENTS|IDENTITY)\.md$/i.test(p.name || "")) {
        const agent = agents.get(agentId);
        if (agent) return resOk(id, { file: { content: buildSystemPrompt(agent, TENANT) } });
      }
      const content = files.get(key);
      return resOk(id, { file: content !== undefined ? { content } : { missing: true } });
    }

    case "agents.files.set":
      files.set(`${p.agentId || DEFAULT_ID}/${p.name || ""}`, typeof p.content === "string" ? p.content : "");
      return resOk(id, {});

    case "config.get":
      return resOk(id, {
        config: { gateway: { reload: { mode: "hot" } }, sgrc: { tenant: TENANT, live: llm.isLive() } },
        hash: "sgrc-gateway",
        exists: true,
        path: "/sgrc/config.json",
      });

    case "config.patch":
    case "config.set":
      return resOk(id, { hash: "sgrc-gateway" });

    case "exec.approvals.get":
      return resOk(id, {
        path: "",
        exists: true,
        hash: "sgrc-approvals",
        file: { version: 1, defaults: { security: "full", ask: "always", autoAllowSkills: false }, agents: {} },
      });

    case "exec.approvals.set":
      return resOk(id, { hash: "sgrc-approvals" });

    case "exec.approval.resolve":
      audit.append({ action: "approval.resolve", decision: p.decision || p.approved || null, ref: p.id || null });
      return resOk(id, { ok: true });

    case "models.list":
      return resOk(id, { models: MODELS });

    case "skills.status": {
      const empty = { bins: [], anyBins: [], env: [], config: [], os: [] };
      return resOk(id, {
        workspaceDir: "/sgrc",
        managedSkillsDir: "/sgrc/skills",
        skills: AGENTS.filter((a) => a.id !== DEFAULT_ID).map((a) => ({
          name: a.role,
          description: `${a.name} · ${a.floor}. Dasar: ${a.basis}`,
          source: "sgrc",
          bundled: true,
          filePath: `/sgrc/skills/${a.id}/SKILL.md`,
          baseDir: `/sgrc/skills/${a.id}`,
          skillKey: a.id.replace(/^sgrc-/, "sgrc-skill-"),
          emoji: a.emoji,
          always: true,
          disabled: false,
          blockedByAllowlist: false,
          eligible: true,
          requirements: empty,
          missing: empty,
          configChecks: [],
          install: [],
        })),
      });
    }

    case "cron.list":
      return resOk(id, { jobs: [] });

    case "cron.add":
    case "cron.run":
    case "cron.remove":
      return resErr(id, "unsupported_method", "Penjadwalan agen SGRC belum diaktifkan.");

    case "sessions.list": {
      const sessions = [...agents.values()].map((agent) => {
        const key = sessionKeyFor(agent.id);
        const history = getHistory(key);
        const settings = sessionSettings.get(key) || {};
        return {
          key,
          agentId: agent.id,
          updatedAt: history.length > 0 ? Date.now() : null,
          displayName: agent.floor,
          origin: { label: agent.name, provider: "sumopod" },
          model: settings.model || llm.MODEL,
          modelProvider: "sumopod",
        };
      });
      return resOk(id, { sessions });
    }

    case "sessions.preview": {
      const keys = Array.isArray(p.keys) ? p.keys : [];
      const limit = typeof p.limit === "number" ? p.limit : 8;
      const maxChars = typeof p.maxChars === "number" ? p.maxChars : 240;
      const previews = keys.map((key) => {
        const history = getHistory(key);
        if (!history.length) return { key, status: "empty", items: [] };
        return {
          key,
          status: "ok",
          items: history.slice(-limit).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            text: String(m.content || "").slice(0, maxChars),
            timestamp: Date.now(),
          })),
        };
      });
      return resOk(id, { ts: Date.now(), previews });
    }

    case "sessions.patch": {
      const key = typeof p.key === "string" ? p.key : sessionKeyFor(DEFAULT_ID);
      const next = { ...(sessionSettings.get(key) || {}) };
      if (p.model !== undefined) next.model = p.model;
      if (p.thinkingLevel !== undefined) next.thinkingLevel = p.thinkingLevel;
      sessionSettings.set(key, next);
      return resOk(id, {
        ok: true,
        key,
        entry: { thinkingLevel: next.thinkingLevel },
        resolved: { model: next.model || llm.MODEL, modelProvider: "sumopod" },
      });
    }

    case "sessions.reset":
      conversationHistory.delete(typeof p.key === "string" ? p.key : sessionKeyFor(DEFAULT_ID));
      return resOk(id, { ok: true });

    case "chat.send": {
      const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey : sessionKeyFor(DEFAULT_ID);
      const agent = agents.get(agentIdFromKey(sessionKey)) || agents.get(DEFAULT_ID);
      const message = (typeof p.message === "string" ? p.message : String(p.message || "")).trim();
      const runId = typeof p.idempotencyKey === "string" && p.idempotencyKey ? p.idempotencyKey : randomId();
      if (!message) return resOk(id, { status: "no-op", runId });

      let aborted = false;
      const controller = new AbortController();
      activeRuns.set(runId, {
        runId,
        sessionKey,
        agentId: agent.id,
        abort() {
          aborted = true;
          controller.abort();
        },
      });

      setImmediate(async () => {
        try {
          if (agent.id !== DEFAULT_ID) {
            await runAgent({ agent, sessionKey, message, runId, sendEvent, isAborted: () => aborted, controller });
            return;
          }

          // Mudir: tentukan fungsi tujuan, lalu serah terima ke agen tersebut.
          const targetId = await routeMessage(message, controller.signal);
          if (targetId === DEFAULT_ID || aborted) {
            await runAgent({ agent, sessionKey, message, runId, sendEvent, isAborted: () => aborted, controller });
            return;
          }

          const target = agents.get(targetId);
          const targetKey = sessionKeyFor(targetId);
          const subRunId = randomId();
          audit.append({ action: "handoff", from: agent.id, to: targetId, runId, subRunId });

          let seq = 0;
          const handoff = `Permintaan ini masuk ranah **${target.role}**. Saya serahkan ke **${target.name}** di ${target.floor}…`;
          sendEvent({
            type: "event",
            event: "chat",
            seq: seq++,
            payload: { runId, sessionKey, state: "delta", message: { role: "assistant", content: handoff } },
          });

          const subController = new AbortController();
          controller.signal.addEventListener("abort", () => subController.abort());
          activeRuns.set(subRunId, { runId: subRunId, sessionKey: targetKey, agentId: targetId, abort: () => subController.abort() });
          const result = await runAgent({
            agent: target,
            sessionKey: targetKey,
            message,
            runId: subRunId,
            sendEvent: broadcastEvent,
            isAborted: () => aborted || subController.signal.aborted,
            controller: subController,
            requestedBy: agent.id,
          });
          activeRuns.delete(subRunId);
          if (!result) {
            sendEvent({ type: "event", event: "chat", seq: seq++, payload: { runId, sessionKey, state: "aborted" } });
            return;
          }

          const summary = `${handoff}\n\n✅ **${target.name}** sudah menyelesaikan draf. Isi lengkapnya ada di meja ${target.name}; berikut salinannya:\n\n${result}`;
          const history = getHistory(sessionKey);
          history.push({ role: "user", content: redact(message).text });
          history.push({ role: "assistant", content: summary });
          sendEvent({
            type: "event",
            event: "chat",
            seq: seq++,
            payload: {
              runId,
              sessionKey,
              state: "final",
              stopReason: "end_turn",
              message: { role: "assistant", content: summary + APPROVAL_FOOTER },
            },
          });
          sendEvent(presenceFrame(sessionKey, agent.id));
        } catch (error) {
          console.error("[sgrc-gateway] run error:", error);
        } finally {
          activeRuns.delete(runId);
        }
      });

      return resOk(id, { status: "started", runId });
    }

    case "chat.abort": {
      const runId = typeof p.runId === "string" ? p.runId.trim() : "";
      const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey.trim() : "";
      let aborted = 0;
      for (const [activeRunId, handle] of activeRuns.entries()) {
        if ((runId && activeRunId === runId) || (!runId && sessionKey && handle.sessionKey === sessionKey)) {
          handle.abort();
          activeRuns.delete(activeRunId);
          aborted += 1;
        }
      }
      return resOk(id, { ok: true, aborted });
    }

    case "chat.history": {
      const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey : sessionKeyFor(DEFAULT_ID);
      return resOk(id, { sessionKey, messages: getHistory(sessionKey) });
    }

    case "agent.wait": {
      const runId = typeof p.runId === "string" ? p.runId : "";
      const timeoutMs = typeof p.timeoutMs === "number" ? p.timeoutMs : 30000;
      const start = Date.now();
      while (activeRuns.has(runId) && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 50));
      return resOk(id, { status: activeRuns.has(runId) ? "running" : "done" });
    }

    case "status": {
      const recent = [...agents.keys()].flatMap((agentId) => {
        const key = sessionKeyFor(agentId);
        return getHistory(key).length ? [{ key, updatedAt: Date.now() }] : [];
      });
      return resOk(id, {
        sessions: {
          recent,
          byAgent: [...agents.keys()].map((agentId) => ({
            agentId,
            recent: recent.filter((e) => e.key.includes(`:${agentId}:`)),
          })),
        },
      });
    }

    case "wake":
      return resOk(id, { ok: true });

    default:
      return resOk(id, {});
  }
}

const METHODS = [
  "agents.list", "agents.update", "sessions.list", "sessions.preview", "sessions.patch", "sessions.reset",
  "chat.send", "chat.abort", "chat.history", "agent.wait", "status", "config.get", "config.set", "config.patch",
  "agents.files.get", "agents.files.set", "exec.approvals.get", "exec.approvals.set", "exec.approval.resolve",
  "wake", "skills.status", "models.list", "cron.list",
];

function startAdapter() {
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, live: llm.isLive(), model: llm.MODEL, agents: agents.size }));
      return;
    }
    if (req.url === "/audit/verify") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(audit.verify()));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ShariaGuard SGRC Gateway Adapter\n");
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws) => {
    let connected = false;
    let globalSeq = 0;
    const send = (frame) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
    };
    const sendEventFn = (frame) => {
      if (frame.type === "event" && typeof frame.seq !== "number") frame.seq = globalSeq++;
      send(frame);
    };
    activeSendEventFns.add(sendEventFn);
    send({ type: "event", event: "connect.challenge", payload: { nonce: randomId() } });

    ws.on("message", async (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      if (!frame || frame.type !== "req" || typeof frame.id !== "string" || typeof frame.method !== "string") return;
      const { id, method, params } = frame;

      if (method === "connect") {
        const token = params?.auth?.token || params?.token || "";
        if (GATEWAY_TOKEN && token !== GATEWAY_TOKEN) {
          send(resErr(id, "unauthorized", "Token gateway SGRC tidak valid."));
          return;
        }
        connected = true;
        send(
          resOk(id, {
            type: "hello-ok",
            protocol: 3,
            adapterType: "hermes",
            features: { methods: METHODS, events: ["chat", "presence", "heartbeat"] },
            snapshot: {
              health: {
                agents: [...agents.values()].map((a) => ({ agentId: a.id, name: a.name, isDefault: a.id === DEFAULT_ID })),
                defaultAgentId: DEFAULT_ID,
              },
              sessionDefaults: { mainKey: MAIN_KEY },
            },
            auth: { role: "operator", scopes: ["operator.admin"] },
            policy: { tickIntervalMs: 30000 },
          })
        );
        return;
      }

      if (!connected) {
        send(resErr(id, "not_connected", "Send connect first."));
        return;
      }
      try {
        send(await handleMethod(method, params, id, sendEventFn));
      } catch (error) {
        send(resErr(id, "internal_error", error instanceof Error ? error.message : "Internal error"));
      }
    });

    ws.on("close", () => activeSendEventFns.delete(sendEventFn));
    ws.on("error", () => activeSendEventFns.delete(sendEventFn));
  });

  httpServer.listen(ADAPTER_PORT, ADAPTER_HOST, () => {
    console.log(`[sgrc-gateway] Listening on ws://${ADAPTER_HOST}:${ADAPTER_PORT}`);
    console.log(
      llm.isLive()
        ? `[sgrc-gateway] Mesin AI aktif: ${llm.MODEL} via ${llm.BASE_URL}`
        : "[sgrc-gateway] SGRC_LLM_API_KEY kosong → mode demo (jawaban contoh)."
    );
    console.log(`[sgrc-gateway] Jejak audit: ${audit.file}`);
  });
}

if (require.main === module) startAdapter();

module.exports = { handleMethod, startAdapter };
