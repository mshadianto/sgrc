"use strict";

// Katib — generator akad Wakalah bil Ujrah massal (Kantor AI Asy-Syirkah).
// GET  /katib/akad                      → halaman unggah
// GET  /katib/akad/contoh-data-pmi.xlsx → contoh Excel
// GET  /katib/akad/template.docx        → template akad (DRAF)
// POST /katib/akad/buat                 → body = file .xlsx; balasan = .zip berisi akad per PMI
// Aktif hanya bila SGRC_ROSTER=syirkah. Berada di balik access gate Studio.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const TOOLS = path.join(__dirname, "..", "tools", "akad-wakalah");
const MAX_BYTES = 5 * 1024 * 1024;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, timeout: 120000 });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.on("error", (e) => resolve({ code: -1, out, err: String(e) }));
  });
}

function page() {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Katib · Akad Wakalah Massal</title>
<style>
:root{--bg:#0b1410;--card:#11201a;--line:#2c4a3a;--ink:#e8efe9;--muted:#9db5a6;--gold:#c9a227;--red:#ff8a80;--ok:#7fd1a8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif;line-height:1.5}
main{max-width:720px;margin:0 auto;padding:28px 16px 48px}
a{color:var(--gold)}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:14px}
.step{display:flex;gap:12px}.n{flex:0 0 28px;height:28px;border-radius:50%;background:var(--gold);color:#111;font-weight:700;display:grid;place-items:center}
.step h2{font-size:16px;margin:2px 0 6px}.step p{margin:0;color:var(--muted);font-size:14px}
.btn{display:inline-block;margin-top:10px;padding:9px 14px;border-radius:8px;border:1px solid var(--line);color:var(--ink);text-decoration:none;font-size:14px;background:#0b1410}
button{margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:var(--gold);color:#111;font-weight:600;font-size:15px;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}input[type=file]{margin-top:10px;color:var(--muted);max-width:100%}
.warn{border-color:#6b4b1c;background:#1f1a0e;color:#e9d39a;font-size:13px}
#hasil{white-space:pre-wrap;font-size:14px;margin-top:12px}.ok{color:var(--ok)}.err{color:var(--red)}
</style></head><body><main>
<p style="margin:0 0 10px"><a href="/office">← Kembali ke kantor</a></p>
<h1>✍️ Katib — Akad Wakalah bil Ujrah Massal</h1>
<p class="sub">Satu akad per Penanam Modal Individual (PMI), lengkap dengan kop resmi Asy-Syirkah, nomor, terbilang, dan porsi otomatis.</p>
<div class="card warn">Template masih <b>DRAF</b> dan wajib direviu DPS &amp; Legal sebelum ditandatangani. Generator tidak mengubah klausul; hanya mengisi data.</div>
<div class="card step"><div class="n">1</div><div><h2>Unduh contoh Excel</h2><p>Sheet <b>Proyek</b> berisi isian per proyek; sheet <b>PMI</b> satu baris per investor (nama, NIK, alamat, no. anggota, nominal, rekening).</p>
<a class="btn" href="/katib/akad/contoh-data-pmi.xlsx">⬇ contoh-data-pmi.xlsx</a> <a class="btn" href="/katib/akad/template.docx">⬇ Template akad (DRAF)</a></div></div>
<div class="card step"><div class="n">2</div><div><h2>Isi dan unggah</h2><p>Isi data proyek dan daftar PMI, simpan, lalu pilih file di bawah.</p>
<input type="file" id="f" accept=".xlsx"><br><button id="go">Buat semua akad</button><div id="hasil"></div></div></div>
<div class="card step"><div class="n">3</div><div><h2>Unduh &amp; cek</h2><p>Hasil berupa file .zip: satu .docx per PMI dan <b>rekap.csv</b>. Baris PMI yang datanya kurang akan dilewati dan dilaporkan di sini.</p></div></div>
</main><script>
const go=document.getElementById('go'),f=document.getElementById('f'),out=document.getElementById('hasil');
go.onclick=async()=>{const file=f.files[0];if(!file){out.className='err';out.textContent='Pilih file Excel dulu.';return}
go.disabled=true;out.className='';out.textContent='Memproses '+file.name+' …';
try{const r=await fetch('/katib/akad/buat',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
const info=decodeURIComponent(r.headers.get('X-Akad-Ringkasan')||'');
if(!r.ok){out.className='err';out.textContent=(await r.text())||('Gagal ('+r.status+')');return}
const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);
a.download=decodeURIComponent(r.headers.get('X-File-Name')||'akad-wakalah.zip');document.body.appendChild(a);a.click();a.remove();
out.className='ok';out.textContent='✓ '+info;}catch(e){out.className='err';out.textContent='Gagal: '+e.message}finally{go.disabled=false}};
</script></body></html>`;
}

function createKatibAkad({ enabled, python, audit } = {}) {
  const py = python || process.env.SGRC_AKAD_PYTHON || "python3";

  const send = (res, code, type, body, headers = {}) => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...headers });
    res.end(body);
  };

  const handle = (req, res) => {
    if (!enabled) return false;
    const url = String(req.url || "").split("?")[0];
    if (!url.startsWith("/katib/akad")) return false;

    if (req.method === "GET" && (url === "/katib/akad" || url === "/katib/akad/")) {
      send(res, 200, "text/html; charset=utf-8", page());
      return true;
    }
    if (req.method === "GET" && url === "/katib/akad/contoh-data-pmi.xlsx") {
      send(res, 200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fs.readFileSync(path.join(TOOLS, "contoh-data-pmi.xlsx")), {
        "Content-Disposition": 'attachment; filename="contoh-data-pmi.xlsx"',
      });
      return true;
    }
    if (req.method === "GET" && url === "/katib/akad/template.docx") {
      send(res, 200, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fs.readFileSync(path.join(TOOLS, "template-akad-wakalah-bil-ujrah.docx")), {
        "Content-Disposition": 'attachment; filename="DRAF-template-akad-wakalah-bil-ujrah.docx"',
      });
      return true;
    }
    if (req.method === "POST" && url === "/katib/akad/buat") {
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BYTES) tooBig = true;
        else chunks.push(c);
      });
      req.on("end", async () => {
        if (tooBig) return send(res, 413, "text/plain; charset=utf-8", "File terlalu besar (maks 5 MB).");
        const buf = Buffer.concat(chunks);
        if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
          return send(res, 400, "text/plain; charset=utf-8", "File bukan Excel .xlsx yang valid.");
        }
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akad-"));
        try {
          const xlsx = path.join(dir, "data.xlsx");
          const outDir = path.join(dir, "hasil");
          fs.writeFileSync(xlsx, buf);
          const gen = await run(py, [path.join(TOOLS, "buat_akad_wakalah.py"), xlsx, path.join(TOOLS, "template-akad-wakalah-bil-ujrah.docx"), outDir]);
          if (gen.code !== 0) {
            const msg = (gen.err || gen.out).split("\n").filter(Boolean).slice(-3).join("\n");
            return send(res, 422, "text/plain; charset=utf-8", "Excel tidak bisa diproses. Pastikan memakai format contoh (sheet Proyek & PMI).\n\n" + msg);
          }
          const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((n) => n.endsWith(".docx")) : [];
          if (!files.length) return send(res, 422, "text/plain; charset=utf-8", gen.out.trim() || "Tidak ada akad yang dibuat.");
          let kode = "proyek";
          const m = files[0].match(/_Akad_Wakalah_(.+?)_/);
          if (m) kode = m[1];
          const zipName = `akad-wakalah-${kode}.zip`;
          const zipPath = path.join(dir, zipName);
          const z = await run(py, ["-m", "zipfile", "-c", zipPath, ...fs.readdirSync(outDir).map((n) => path.join(outDir, n))]);
          if (z.code !== 0) return send(res, 500, "text/plain; charset=utf-8", "Gagal membuat zip.");
          const lines = gen.out.trim().split("\n");
          const ringkas = lines.filter((l) => /^(Selesai|DILEWATI|PERINGATAN)/.test(l)).join(" · ").replace(/ di \/\S+/, "");
          audit?.append({
            action: "akad.wakalah.generate",
            kode,
            jumlah: files.length,
            dilewati: lines.filter((l) => l.startsWith("DILEWATI")).length,
            inputHash: crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16),
          });
          send(res, 200, "application/zip", fs.readFileSync(zipPath), {
            "Content-Disposition": `attachment; filename="${zipName}"`,
            "X-File-Name": encodeURIComponent(zipName),
            "X-Akad-Ringkasan": encodeURIComponent(ringkas || `${files.length} akad dibuat`),
            "Access-Control-Expose-Headers": "X-File-Name, X-Akad-Ringkasan",
          });
        } catch (e) {
          send(res, 500, "text/plain; charset=utf-8", "Kesalahan server: " + e.message);
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
      return true;
    }
    send(res, 404, "text/plain; charset=utf-8", "Tidak ditemukan.");
    return true;
  };

  return { handle };
}

module.exports = { createKatibAkad };
