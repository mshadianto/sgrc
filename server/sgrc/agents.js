"use strict";

// Pemilih roster kantor. SGRC_ROSTER=sgrc (default) atau syirkah.
const ROSTER_ID = (process.env.SGRC_ROSTER || "sgrc").trim().toLowerCase();
let ROSTER;
try {
  ROSTER = require(`./rosters/${ROSTER_ID.replace(/[^a-z0-9-]/g, "")}`);
} catch {
  ROSTER = require("./rosters/sgrc");
}
const AGENTS = ROSTER.agents;

function buildSystemPrompt(agent, tenant) {
  const lembaga =
    tenant && tenant.name
      ? `${ROSTER.tenantLabel}: ${tenant.name}${tenant.tier ? ` (${tenant.tier})` : ""}.`
      : `${ROSTER.tenantLabel}: ${ROSTER.tenantDefault} (data demo).`;
  const today = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" });
  return `${agent.prompt}\n\n${lembaga}\nTanggal hari ini: ${today}.\nDasar utama peran Anda: ${agent.basis}.\n\n${ROSTER.commonRules}`;
}

module.exports = { AGENTS, ROSTER, buildSystemPrompt };
