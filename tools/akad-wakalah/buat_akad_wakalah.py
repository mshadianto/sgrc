#!/usr/bin/env python3
"""Generator akad Wakalah bil Ujrah massal — Kantor AI Asy-Syirkah (Katib).

Pakai:
    python buat_akad_wakalah.py data-pmi.xlsx [template.docx] [folder-keluaran]

data-pmi.xlsx berisi dua sheet:
  - "Proyek": kolom A = nama isian, kolom B = nilai (satu proyek per file).
  - "PMI"   : satu baris per Penanam Modal Individual.
Keluaran: satu .docx per PMI + rekap.csv (nomor akad, nama, nominal, porsi).
Isi klausul TIDAK diubah oleh generator; hanya kolom isian yang diganti.
"""
import csv
import os
import sys
from datetime import date, datetime

from docxtpl import DocxTemplate
from openpyxl import load_workbook

HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Ahad"]
BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
         "Agustus", "September", "Oktober", "November", "Desember"]
ROMAWI = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"]


def terbilang(n: int) -> str:
    n = int(n)
    if n < 12:
        return SATUAN[n]
    if n < 20:
        return terbilang(n - 10) + " belas"
    if n < 100:
        return (terbilang(n // 10) + " puluh " + terbilang(n % 10)).strip()
    if n < 200:
        return ("seratus " + terbilang(n - 100)).strip()
    if n < 1000:
        return (terbilang(n // 100) + " ratus " + terbilang(n % 100)).strip()
    if n < 2000:
        return ("seribu " + terbilang(n - 1000)).strip()
    for nilai, nama in ((10**12, "triliun"), (10**9, "miliar"), (10**6, "juta"), (1000, "ribu")):
        if n >= nilai:
            return (terbilang(n // nilai) + f" {nama} " + terbilang(n % nilai)).strip()
    return ""


def rupiah(n) -> str:
    return f"{int(round(float(n))):,}".replace(",", ".")


def as_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v.strip():
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(v.strip(), fmt).date()
            except ValueError:
                pass
    return None


def tgl_indo(d: date) -> str:
    return f"{d.day} {BULAN[d.month]} {d.year}"


def baca_proyek(ws):
    data = {}
    for row in ws.iter_rows(min_row=1, values_only=True):
        if row and row[0] and str(row[0]).strip() and not str(row[0]).startswith("#"):
            data[str(row[0]).strip()] = row[1] if row[1] is not None else ""
    return data


def baca_pmi(ws):
    rows = list(ws.iter_rows(values_only=True))
    head = [str(h).strip() if h else "" for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not r or not any(r):
            continue
        out.append({h: (v if v is not None else "") for h, v in zip(head, r) if h})
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    xlsx = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    tpl_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "template-akad-wakalah-bil-ujrah.docx")
    wb = load_workbook(xlsx, data_only=True)
    proyek = baca_proyek(wb["Proyek"])
    daftar = baca_pmi(wb["PMI"])
    kode = str(proyek.get("kode_proyek", "PROYEK")).strip()
    out_dir = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(xlsx)), f"akad-{kode}")
    os.makedirs(out_dir, exist_ok=True)

    tgl = as_date(proyek.get("tanggal_akad")) or date.today()
    total = sum(float(p.get("nominal_dana") or 0) for p in daftar)
    total_proyek = float(proyek.get("total_dana_proyek") or total)
    if abs(total - total_proyek) > 0.5:
        print(f"PERINGATAN: jumlah dana PMI Rp{rupiah(total)} ≠ total kebutuhan proyek Rp{rupiah(total_proyek)}")

    mulai = int(proyek.get("nomor_mulai") or 1)
    rekap = []
    errors = []
    for i, pmi in enumerate(daftar):
        nama = str(pmi.get("nama_pmi", "")).strip()
        nominal = float(pmi.get("nominal_dana") or 0)
        wajib = ["nama_pmi", "nik_pmi", "alamat_pmi", "nominal_dana", "rekening_pmi"]
        kurang = [k for k in wajib if not str(pmi.get(k, "")).strip()]
        if kurang or nominal <= 0:
            errors.append(f"Baris {i + 2} ({nama or '?'}): kolom kosong/tidak valid {kurang or ['nominal_dana']}")
            continue
        nomor = f"{mulai + i:03d}/ASYSYIRKAH-{kode}/WKL/{ROMAWI[tgl.month]}/{tgl.year}"
        porsi = nominal / total_proyek * 100 if total_proyek else 0
        ctx = {k: ("" if v is None else v) for k, v in proyek.items()}
        ctx.update({k: v for k, v in pmi.items()})
        ctx.update({
            "nomor_akad": nomor,
            "hari_akad": HARI[tgl.weekday()],
            "tanggal_akad": tgl_indo(tgl),
            "nominal_dana": rupiah(nominal),
            "nominal_terbilang": terbilang(int(round(nominal))).capitalize(),
            "porsi_pmi": f"{porsi:.2f}%".replace(".", ","),
            "total_dana_proyek": rupiah(total_proyek),
        })
        if proyek.get("proyeksi_persen"):
            pct = float(proyek["proyeksi_persen"])
            ctx["proyeksi_hasil"] = f"sekitar Rp{rupiah(nominal * pct / 100)} ({str(pct).replace('.', ',')}% dari dana MUWAKKIL selama {proyek.get('jangka_waktu', '')})"
        if not ctx.get("no_anggota"):
            ctx["no_anggota"] = "-"
        doc = DocxTemplate(tpl_path)
        doc.render(ctx)
        aman = "".join(c for c in nama if c.isalnum() or c in " -_").strip().replace(" ", "_")
        fn = os.path.join(out_dir, f"{mulai + i:03d}_Akad_Wakalah_{kode}_{aman}.docx")
        doc.save(fn)
        rekap.append([nomor, nama, rupiah(nominal), ctx["porsi_pmi"], os.path.basename(fn)])

    with open(os.path.join(out_dir, "rekap.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Nomor Akad", "Nama PMI", "Nominal (Rp)", "Porsi", "File"])
        w.writerows(rekap)
    print(f"Selesai: {len(rekap)} akad dibuat di {out_dir}")
    for e in errors:
        print("DILEWATI —", e)


if __name__ == "__main__":
    main()
