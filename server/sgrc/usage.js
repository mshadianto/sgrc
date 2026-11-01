"use strict";

// Pemakaian token & biaya dari jejak audit gateway (draft.ready / route.usage),
// disajikan dalam format panel Analytics Hermes3D (sessions.usage & usage.cost),
// serta batas anggaran harian/bulanan yang ditegakkan gateway.

const fs = require("fs");

// Tarif SumoPod per 1 juta token (USD). Bisa ditimpa: SGRC_PRICING_JSON='{"model":{"in":0.1,"out":0.5}}'
const DEFAULT_PRICING = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

function pricing() {
  let extra = {};
  try {
    extra = JSON.parse(process.env.SGRC_PRICING_JSON || "{}");
  } catch {}
  return { ...DEFAULT_PRICING, ...extra };
}

function costOf(model, input, output) {
  const p = pricing()[model] || { in: 0, out: 0 };
  const inputCost = (input / 1e6) * p.in;
  const outputCost = (output / 1e6) * p.out;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

function readEntries(file) {
  let lines = [];
  try {
    lines = fs.readFileSync(file, "utf8").split("\n");
  } catch {
    return [];
  }
  const out = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}

const day = (ts) => String(ts || "").slice(0, 10); // UTC, sama dengan panel

function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, totalCost: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, durationMs: 0 };
}

function addInto(t, r) {
  t.input += r.input;
  t.output += r.output;
  t.totalTokens += r.input + r.output;
  t.inputCost += r.inputCost;
  t.outputCost += r.outputCost;
  t.totalCost += r.totalCost;
  t.durationMs += r.durationMs || 0;
}

/** Ubah entri audit menjadi baris pemakaian. */
function usageRecords(file, { startDate, endDate } = {}) {
  const entries = readEntries(file);
  const startTs = new Map();
  for (const e of entries) if (e.action === "task.start" && e.runId) startTs.set(e.runId, Date.parse(e.ts));
  const rows = [];
  for (const e of entries) {
    if (!(e.action === "draft.ready" || e.action === "route.usage")) continue;
    if (!e.usage || (e.usage.input == null && e.usage.output == null)) continue;
    const d = day(e.ts);
    if (startDate && d < startDate) continue;
    if (endDate && d > endDate) continue;
    const input = Number(e.usage.input) || 0;
    const output = Number(e.usage.output) || 0;
    const c = costOf(e.model, input, output);
    const begun = startTs.get(e.runId);
    rows.push({
      date: d,
      agentId: e.agent || null,
      model: e.model || null,
      kind: e.action === "route.usage" ? "router" : "agent",
      fallback: Boolean(e.fallback),
      input,
      output,
      thinking: Number(e.usage.thinking) || 0,
      ...c,
      durationMs: e.action === "draft.ready" && begun ? Math.max(0, Date.parse(e.ts) - begun) : 0,
      ts: Date.parse(e.ts),
    });
  }
  return rows;
}

/** Respons untuk metode gateway "sessions.usage". */
function sessionsUsage(file, params, sessionKeyFor) {
  const rows = usageRecords(file, params);
  const byAgent = new Map();
  for (const r of rows) {
    const id = r.agentId || "router";
    if (!byAgent.has(id)) byAgent.set(id, []);
    byAgent.get(id).push(r);
  }
  const grand = emptyTotals();
  const sessions = [];
  for (const [agentId, list] of byAgent) {
    const totals = emptyTotals();
    const models = new Map();
    const daily = new Map();
    let errors = 0;
    for (const r of list) {
      addInto(totals, r);
      addInto(grand, r);
      const mk = r.model || "?";
      if (!models.has(mk)) models.set(mk, { provider: "sumopod", model: r.model, count: 0, totals: emptyTotals() });
      const m = models.get(mk);
      m.count += 1;
      addInto(m.totals, r);
      if (!daily.has(r.date)) daily.set(r.date, { date: r.date, tokens: 0, cost: 0, total: 0 });
      const dd = daily.get(r.date);
      dd.tokens += r.input + r.output;
      dd.cost += r.totalCost;
      if (r.kind === "agent") dd.total += 1;
      if (r.fallback) errors += 1;
    }
    const answers = list.filter((r) => r.kind === "agent").length;
    sessions.push({
      key: agentId === "router" ? "router:mudir" : sessionKeyFor(agentId),
      label: agentId === "router" ? "Routing Mudir" : null,
      agentId: agentId === "router" ? null : agentId,
      model: list[list.length - 1].model,
      modelProvider: "sumopod",
      updatedAt: Math.max(...list.map((r) => r.ts)),
      usage: {
        ...totals,
        messageCounts: { total: answers * 2, user: answers, assistant: answers, toolCalls: 0, toolResults: 0, errors },
        toolUsage: { totalCalls: 0, tools: [] },
        modelUsage: [...models.values()],
        dailyBreakdown: [...daily.values()].map(({ date, tokens, cost }) => ({ date, tokens, cost })),
        dailyMessageCounts: [...daily.values()].map(({ date, total }) => ({ date, total, toolCalls: 0, errors: 0 })),
      },
    });
  }
  return { sessions, totals: grand };
}

/** Respons untuk metode gateway "usage.cost". */
function usageCost(file, params) {
  const daily = new Map();
  for (const r of usageRecords(file, params)) {
    if (!daily.has(r.date)) daily.set(r.date, { date: r.date, ...emptyTotals() });
    addInto(daily.get(r.date), r);
  }
  return { daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Cek batas anggaran (SGRC_BUDGET_DAILY_USD / SGRC_BUDGET_MONTHLY_USD). */
function budgetStatus(file) {
  const dailyLimit = parseFloat(process.env.SGRC_BUDGET_DAILY_USD || "") || null;
  const monthlyLimit = parseFloat(process.env.SGRC_BUDGET_MONTHLY_USD || "") || null;
  if (!dailyLimit && !monthlyLimit) return { ok: true };
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let todayCost = 0;
  let monthCost = 0;
  for (const r of usageRecords(file, { startDate: `${month}-01` })) {
    monthCost += r.totalCost;
    if (r.date === today) todayCost += r.totalCost;
  }
  if (dailyLimit && todayCost >= dailyLimit) return { ok: false, scope: "harian", used: todayCost, limit: dailyLimit };
  if (monthlyLimit && monthCost >= monthlyLimit) return { ok: false, scope: "bulanan", used: monthCost, limit: monthlyLimit };
  return { ok: true, todayCost, monthCost, dailyLimit, monthlyLimit };
}

module.exports = { sessionsUsage, usageCost, budgetStatus, costOf, usageRecords, DEFAULT_PRICING };
