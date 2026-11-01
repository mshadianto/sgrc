"use strict";

// Klien LLM OpenAI-compatible (SumoPod AI gateway secara default) dengan streaming.
// ENV:
//   SGRC_LLM_BASE_URL  (default https://ai.sumopod.com/v1)
//   SGRC_LLM_API_KEY   (wajib untuk mode nyata; tanpa ini adapter jalan di mode demo)
//   SGRC_LLM_MODEL     (default claude-sonnet-5-5)
//   SGRC_LLM_ROUTER_MODEL (opsional, mis. claude-haiku-5-5 untuk routing Mudir)
//   SGRC_LLM_FALLBACK_MODEL (opsional, mis. claude-sonnet-5-5; dipakai bila model utama gagal/kosong)
//   SGRC_LLM_MAX_TOKENS (default 1800)

const BASE_URL = (process.env.SGRC_LLM_BASE_URL || "https://ai.sumopod.com/v1").replace(/\/+$/, "");
const API_KEY = process.env.SGRC_LLM_API_KEY || "";
const MODEL = process.env.SGRC_LLM_MODEL || "claude-sonnet-5-5";
// Model murah untuk routing Mudir (jawaban 1 kata). Default = model utama.
const ROUTER_MODEL = process.env.SGRC_LLM_ROUTER_MODEL || MODEL;
const FALLBACK_MODEL = process.env.SGRC_LLM_FALLBACK_MODEL || "";
const MAX_TOKENS = parseInt(process.env.SGRC_LLM_MAX_TOKENS || "1800", 10);

const isLive = () => Boolean(API_KEY);

/**
 * Stream jawaban. onDelta(fullTextSoFar) dipanggil tiap potongan.
 * Mengembalikan teks penuh. signal: AbortSignal.
 */
async function streamChat({ system, messages, model, onDelta, signal }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: model || MODEL,
      stream: true,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return full;
      try {
        const json = JSON.parse(data);
        const piece = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
        if (piece) {
          full += piece;
          onDelta?.(full);
        }
      } catch {
        /* abaikan baris non-JSON */
      }
    }
  }
  return full;
}

/** Panggilan singkat tanpa streaming (untuk routing Mudir). */
async function completeOnce({ system, user, model, signal }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: model || ROUTER_MODEL,
      max_tokens: 10,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content || "").trim();
}

module.exports = { streamChat, completeOnce, isLive, MODEL, ROUTER_MODEL, FALLBACK_MODEL, BASE_URL };
