import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
wb=Workbook(); ws=wb.active; ws.title="Proyek"
rows=[("# Isian per proyek (kolom A jangan diubah). Contoh data FIKTIF.",""),
("kode_proyek","BTM-01"),("nama_proyek","Pengadaan Kain Katun Jepang 12.000 yard"),("nama_nasabah","CV Berkah Tekstil Mandiri"),
("akad_proyek","Murabahah"),("objek_proyek","12.000 yard kain katun Jepang"),("total_dana_proyek",540000000),
("jangka_waktu","6 (enam) bulan"),("proyeksi_persen",7.5),("proyeksi_hasil","sesuai Executive Summary"),
("ujrah","Rp15.000.000 (lima belas juta rupiah) untuk keseluruhan Proyek"),
("sumber_ujrah","oleh Nasabah kepada WAKIL dan tidak dipotong dari Dana Wakalah"),("waktu_ujrah","saat penandatanganan akad pembiayaan dengan Nasabah"),
("jaminan","SHM ruko di Ciledug, taksiran Rp1,5 miliar"),("no_nota_komite","[ISI]/ASYSYIRKAH-KOMITE/INT/XI/2026"),("no_exsum","[ISI]/ASYSYIRKAH-BTM/PMI/XI/2026"),
("tanggal_akad","2026-11-10"),("tempat_akad","Tangerang Selatan"),("nomor_mulai",1),
("wakil_nama_1","[Nama CEO]"),("wakil_jabatan_1","Chief Executive Officer"),("wakil_nama_2","[Nama CBO]"),("wakil_jabatan_2","Chief of Business Officer"),
("rekening_penampung","[Bank] No. [ISI] a.n. Koperasi Asy-Syirkah Muamalah Indonesia"),("batas_setor","[tanggal]"),("hari_pengembalian","5 (lima)"),
("jadwal_distribusi","angsuran bulanan Nasabah"),("hari_distribusi","3 (tiga)"),("periode_laporan","bulan"),
("forum_sengketa","Badan Arbitrase Syariah Nasional (BASYARNAS) atau Pengadilan Agama sesuai domisili WAKIL"),("saksi_1","[Nama saksi]")]
for r in rows: ws.append(r)
ws.column_dimensions["A"].width=22; ws.column_dimensions["B"].width=80; ws["A1"].font=Font(italic=True,color="C00000")
p=wb.create_sheet("PMI"); head=["nama_pmi","nik_pmi","alamat_pmi","no_anggota","nominal_dana","rekening_pmi"]
p.append(head)
for c in p[1]: c.font=Font(bold=True,color="FFFFFF"); c.fill=PatternFill("solid",fgColor="0F6B57")
for r in [("Ahmad Contoh","3174000000000001","Jl. Contoh No. 1, Jakarta Selatan","A-001",240000000,"BSI 0000000001 a.n. Ahmad Contoh"),
          ("Fatimah Contoh","3674000000000002","Jl. Contoh No. 2, Tangerang Selatan","A-002",200000000,"Muamalat 0000000002 a.n. Fatimah Contoh"),
          ("Umar Contoh","3201000000000003","Jl. Contoh No. 3, Bogor","A-003",100000000,"BSI 0000000003 a.n. Umar Contoh")]: p.append(r)
for col,w in zip("ABCDEF",[22,20,38,12,16,40]): p.column_dimensions[col].width=w
for c in p["E"][1:]: c.number_format='#,##0'
wb.save(sys.argv[1]); print("ok")
