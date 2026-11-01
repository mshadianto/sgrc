# Akad Wakalah bil Ujrah massal — Asy-Syirkah

**Status:** DRAF TEMPLATE. Klausul wajib direviu DPS dan legal sebelum dipakai.
Bila naskah resmi dari Asy-Syirkah tersedia, template ini disesuaikan.

## Isi folder
- `template-akad-wakalah-bil-ujrah.docx` — template di atas kop resmi; kolom isian berbentuk `{{ nama_isian }}`.
  Boleh diedit di Word (ubah/ tambah klausul). Jangan ubah tulisan di dalam `{{ }}` kecuali sekaligus mengganti nama kolom di Excel.
- `contoh-data-pmi.xlsx` — sheet **Proyek** (isian per proyek) dan **PMI** (satu baris per investor). Data contoh FIKTIF.
- `buat_akad_wakalah.py` — generator: satu file akad per PMI + `rekap.csv`.
- `contoh-hasil/` — 3 contoh akad hasil generator.
- `alat/` — skrip pembentuk template (untuk developer). `_build/` boleh dihapus.

## Cara pakai (Windows)
1. Sekali saja: `pip install docxtpl openpyxl`
2. Salin `contoh-data-pmi.xlsx`, isi sheet Proyek dan PMI.
3. Jalankan: `python buat_akad_wakalah.py data-pmi-PROYEK.xlsx`
4. Hasil ada di folder `akad-<kode_proyek>`; cek `rekap.csv`.

Generator otomatis: nomor akad (`001/ASYSYIRKAH-<kode>/WKL/<bln romawi>/<tahun>`), hari & tanggal Indonesia,
nominal + terbilang, porsi PMI (%), dan proyeksi hasil per PMI (dari `proyeksi_persen`).
Baris PMI yang datanya tidak lengkap dilewati dan dilaporkan.
