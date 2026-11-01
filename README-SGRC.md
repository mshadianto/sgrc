# ShariaGuard SGRC Office (di atas Hermes3D)

Kantor AI *Sharia Governance, Risk & Compliance* untuk BPR Syariah. Antarmuka kantor 3D/2D memakai [Hermes3D](https://github.com/iamlukethedev/Hermes3D) (MIT); runtime agennya ditulis khusus untuk SGRC dan memanggil LLM lewat SumoPod.

Konsep & konten: Dr. Yaser Taufik Syamlan (risiko & audit), Ustad Asnan (agen syariah). Pengembangan aplikasi: M. Sopian Hadianto.

## Isi kantor

| Agen | Peran | Ruang | Pemilik manusia | Dasar |
|---|---|---|---|---|
| **Mudir** 🧭 | Koordinator, merutekan tugas ke fungsi yang tepat | Lobi | Direktur Kepatuhan | POJK 9/2024 |
| **Haris** 🛡️ | Sharia Risk Manager (lini 2): SNCR register, KRI, heatmap, kajian produk baru | L1 · Risiko & Kepatuhan Syariah | PE MR/Kepatuhan Syariah | SEOJK 15/2025 III.J.9 |
| **Multazim** 📜 | Kepatuhan Syariah/SCO: gap analysis fatwa & POJK, reviu promosi, komitmen OJK | L1 · Risiko & Kepatuhan Syariah | Direktur Kepatuhan | SEOJK 15/2025 III.G.17; SEOJK 8/2025 |
| **Raqib** 🕌 | Asisten DPS: draf opini, risalah rapat, Laporan Hasil Pengawasan DPS | L3 · Majelis DPS | Ketua DPS | POJK 25/2024 Ps. 20–33 |
| **Muhasib** 🔍 | Auditor Syariah Intern (lini 3, independen): program audit per akad, temuan 5C | L2 · Audit Intern Syariah | PE Audit Intern | SEOJK 15/2025 III.H.8; SEOJK 9/2025 |

Bila pengguna mengetik ke Mudir, Mudir memilih fungsi tujuan lalu menyerahkan tugas; agen tujuan terlihat bekerja di kantor dan hasilnya disalin kembali ke Mudir.

## Pengaman yang sudah ada

- **Draf saja.** Setiap jawaban diberi penanda "DRAF AI"; keputusan dan tanda tangan tetap pada pejabat berwenang.
- **Data L4 tidak dikirim ke LLM.** NIK, NPWP, nomor rekening/kartu, email, dan telepon disamarkan sebelum dikirim (`server/sgrc/guard.js`).
- **Jejak audit hash-chain.** Setiap tugas, serah terima, draf, dan persetujuan dicatat ke `~/.hermes/sgrc/audit.jsonl` (atau `$HERMES_STATE_DIR/sgrc/`). Cek keutuhan: `npm run sgrc:verify-audit` atau `GET http://127.0.0.1:18789/audit/verify`.
- **Independensi auditor** ditanam di prompt Muhasib (menolak konsultasi di area yang diauditnya).
- Struktur agen dikunci dari server; tombol tambah/hapus agen di UI ditolak.

## Menjalankan lokal

```bash
npm install
cp .env.example .env          # isi bagian "ShariaGuard SGRC"
npm run sgrc-gateway          # terminal 1 — tanpa SGRC_LLM_API_KEY berjalan di mode demo
npm run dev                   # terminal 2 — buka http://localhost:3000
```

Di layar koneksi pilih **Hermes backend**, URL `ws://localhost:18789`.

## Deploy ke VPS

```bash
sudo bash deploy/install-vps.sh      # run pertama membuat /opt/sgrc-office/.env lalu berhenti
sudo nano /opt/sgrc-office/.env      # isi token & SGRC_LLM_API_KEY
sudo bash deploy/install-vps.sh      # build, pasang systemd + Caddy
```

Default: Studio di `127.0.0.1:8099`, gateway di `127.0.0.1:18789`, Caddy `sgrc.mshadianto.id` (ganti di `deploy/sgrc.caddy` bila memakai `sgrc.tazkia.ac.id`). `STUDIO_ACCESS_TOKEN` wajib diisi karena Studio dibuka ke publik.

## Belum dikerjakan (menuju produksi, lihat `docs/ARSITEKTUR.md` tim)

1. Auth dengan MFA dan RBAC (`admin`, `direksi`, `dps`, `auditor`, `staf`); saat ini satu token akses Studio.
2. Multi-tenant + onboarding tier (`config/rules.js` dari prototipe Dr. Yaser) dan isolasi RAG per tenant.
3. Knowledge base (fatwa DSN-MUI, POJK/SEOJK) + tool loop; agen sekarang menjawab dari prompt saja, jadi rujukan pasal wajib diverifikasi manusia.
4. Tata letak 3D "ShariaGuard Tower" (menara 3 lantai + masjid) sesuai mockup; saat ini memakai denah Hermes3D dengan label ruang SGRC di tampilan 2D.
5. Tombol persetujuan pejabat yang tercatat di jejak audit.
6. Penjadwal (H-30 laporan DPS, KRI bulanan).
