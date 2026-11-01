# Bangun template akad Wakalah bil Ujrah (docxtpl) di atas kop surat resmi Asy-Syirkah.
import re, sys, os, shutil, subprocess
from xml.sax.saxutils import escape

SRC = sys.argv[1]          # folder hasil unzip dokumen asli (berisi kop surat)
OUT = sys.argv[2]          # path .docx template keluaran

FONT = '<w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:cs="Tahoma"/>'


def run(text, bold=False, italic=False, color=None, size=20, underline=False):
    rpr = FONT + ("<w:b/><w:bCs/>" if bold else "") + ("<w:i/><w:iCs/>" if italic else "")
    rpr += ('<w:u w:val="single"/>' if underline else "")
    rpr += (f'<w:color w:val="{color}"/>' if color else "")
    rpr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:lang w:val="id-ID"/>'
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def rich(text, **kw):
    """**tebal** sederhana di dalam teks."""
    parts = re.split(r"(\*\*[^*]+\*\*)", text)
    out = ""
    for p in parts:
        if p.startswith("**") and p.endswith("**"):
            out += run(p[2:-2], bold=True, **kw)
        elif p:
            out += run(p, **kw)
    return out


def para(text="", align="both", left=0, hanging=0, after=60, keep=False, **kw):
    ind = ""
    if left or hanging:
        ind = f'<w:ind w:left="{left}"' + (f' w:hanging="{hanging}"' if hanging else "") + "/>"
    kp = "<w:keepNext/>" if keep else ""
    ppr = f'<w:pPr>{kp}<w:spacing w:after="{after}" w:line="276" w:lineRule="auto"/>{ind}<w:jc w:val="{align}"/></w:pPr>'
    return f"<w:p>{ppr}{rich(text, **kw) if text else ''}</w:p>"


def pasal(no, judul):
    return '<w:p><w:pPr><w:spacing w:before="120" w:after="0"/></w:pPr></w:p>' + para(f"PASAL {no}", align="center", after=0, bold=True, keep=True) + para(judul.upper(), align="center", after=120, bold=True, keep=True)


def item(label, text, level=1):
    left = 425 * level
    return para(f"{label}\t{text}", left=left, hanging=425)


def table(rows, widths):
    tw = sum(widths)
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    out = f'<w:tbl><w:tblPr><w:tblW w:w="{tw}" w:type="dxa"/><w:tblBorders>' + "".join(
        f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>' for s in ("top", "left", "bottom", "right", "insideH", "insideV")
    ) + f'</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>'
    for i, r in enumerate(rows):
        out += "<w:tr>"
        for c, w in zip(r, widths):
            shade = '<w:shd w:val="clear" w:color="auto" w:fill="E8F3EE"/>' if i == 0 else ""
            out += f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{shade}</w:tcPr>{para(c, align="left", after=0, bold=(i == 0))}</w:tc>'
        out += "</w:tr>"
    return out + "</w:tbl>"


B = []  # isi badan dokumen
B.append(para("DRAF TEMPLATE — untuk reviu DPS dan Legal sebelum dipakai. Hapus baris ini setelah disetujui.", align="center", italic=True, color="C00000", size=16, after=120))
B.append(para("AKAD WAKALAH BIL UJRAH", align="center", bold=True, size=26, after=0))
B.append(para("PENGELOLAAN DANA PENANAM MODAL INDIVIDUAL", align="center", bold=True, after=0))
B.append(para("Nomor: {{ nomor_akad }}", align="center", after=200))
B.append(para("“Hai orang-orang yang beriman, penuhilah akad-akad itu.” (QS Al-Ma’idah [5]: 1)", align="center", italic=True, after=200))
B.append(para("Pada hari ini {{ hari_akad }}, tanggal {{ tanggal_akad }}, bertempat di {{ tempat_akad }}, yang bertanda tangan di bawah ini:"))
B.append(item("I.", "**Koperasi Asy-Syirkah Muamalah Indonesia**, berkedudukan di Jl. Cirendeu Indah III No. 165, Cirendeu, Ciputat, Tangerang Selatan, dalam hal ini diwakili oleh {{ wakil_nama_1 }} selaku {{ wakil_jabatan_1 }} dan {{ wakil_nama_2 }} selaku {{ wakil_jabatan_2 }}, yang bertindak untuk dan atas nama koperasi berdasarkan Anggaran Dasar/Anggaran Rumah Tangga koperasi, selanjutnya disebut **“WAKIL”**."))
B.append(item("II.", "**{{ nama_pmi }}**, Warga Negara Indonesia, pemegang Kartu Tanda Penduduk Nomor {{ nik_pmi }}, beralamat di {{ alamat_pmi }}, Nomor Anggota {{ no_anggota }}, selanjutnya disebut **“MUWAKKIL”** atau **“Penanam Modal Individual (PMI)”**."))
B.append(para("WAKIL dan MUWAKKIL secara bersama-sama disebut “PARA PIHAK”. PARA PIHAK terlebih dahulu menerangkan hal-hal sebagai berikut:", after=60))
B.append(item("a.", "Bahwa WAKIL adalah koperasi yang menjalankan usaha berdasarkan prinsip syariah, antara lain menganalisis kelayakan pembiayaan, menyusun ringkasan proyek (executive summary), mempertemukan proyek dengan penanam modal, serta mengelola dan memantau pembiayaan."))
B.append(item("b.", "Bahwa Komite Pembiayaan WAKIL telah menyetujui pembiayaan Proyek {{ kode_proyek }} — {{ nama_proyek }} kepada {{ nama_nasabah }} (“Nasabah”) dengan akad {{ akad_proyek }}, berdasarkan Nota Usulan Nomor {{ no_nota_komite }}."))
B.append(item("c.", "Bahwa MUWAKKIL telah menerima, membaca, dan memahami Executive Summary Nomor {{ no_exsum }}, termasuk proyeksi hasil dan risiko pembiayaan Proyek tersebut."))
B.append(item("d.", "Bahwa MUWAKKIL bermaksud mewakilkan pengelolaan dananya kepada WAKIL untuk disalurkan pada Proyek tersebut, dan WAKIL bersedia menerimanya dengan imbalan (ujrah) yang disepakati."))
B.append(para("Berdasarkan hal-hal tersebut, PARA PIHAK sepakat membuat Akad Wakalah bil Ujrah ini dengan merujuk pada Fatwa DSN-MUI No. 10/DSN-MUI/IV/2000 tentang Wakalah dan Fatwa DSN-MUI No. 113/DSN-MUI/IX/2017 tentang Akad Wakalah bi al-Ujrah, dengan ketentuan sebagai berikut:", after=200))

B.append(pasal(1, "Definisi"))
for l, t in [
    ("1.", "**Dana Wakalah** adalah dana milik MUWAKKIL yang diwakilkan pengelolaannya kepada WAKIL berdasarkan Akad ini."),
    ("2.", "**Proyek** adalah pembiayaan kepada Nasabah sebagaimana disebut dalam huruf b premis Akad ini beserta Lampiran Akad."),
    ("3.", "**Rekening Penampung** adalah rekening atas nama WAKIL yang khusus digunakan untuk menampung dan menyalurkan dana PMI Proyek."),
    ("4.", "**Ujrah** adalah imbalan yang menjadi hak WAKIL atas pelaksanaan kuasa berdasarkan Akad ini."),
    ("5.", "**Hasil Proyek** adalah pokok dan margin/bagi hasil yang diterima dari Nasabah sesuai akad pembiayaan Proyek."),
]:
    B.append(item(l, t))

B.append(pasal(2, "Objek dan Ruang Lingkup Wakalah"))
B.append(item("1.", "MUWAKKIL dengan ini memberi kuasa kepada WAKIL, dan WAKIL menerima kuasa tersebut, untuk dan atas nama MUWAKKIL:"))
for l, t in [
    ("a.", "menerima Dana Wakalah dan menempatkannya pada Rekening Penampung;"),
    ("b.", "menyalurkan Dana Wakalah kepada Nasabah melalui akad {{ akad_proyek }} untuk Proyek, termasuk melakukan pembelian dan penguasaan barang sebelum akad jual beli dalam hal akad Murabahah;"),
    ("c.", "menandatangani akad pembiayaan, dokumen pengikatan jaminan, dan dokumen lain yang terkait dengan Proyek;"),
    ("d.", "menerima pembayaran angsuran/bagi hasil dari Nasabah dan meneruskan bagian MUWAKKIL;"),
    ("e.", "melakukan pemantauan, penagihan, restrukturisasi atas persetujuan MUWAKKIL, serta tindakan atas jaminan apabila Nasabah wanprestasi; dan"),
    ("f.", "melaporkan perkembangan Proyek kepada MUWAKKIL."),
]:
    B.append(item(l, t, level=2))
B.append(item("2.", "WAKIL dilarang menggunakan Dana Wakalah untuk proyek lain atau kepentingan lain di luar ruang lingkup Akad ini."))

B.append(pasal(3, "Dana Wakalah"))
B.append(item("1.", "Jumlah Dana Wakalah adalah sebesar **Rp{{ nominal_dana }}** ({{ nominal_terbilang }} rupiah)."))
B.append(item("2.", "MUWAKKIL menyetorkan Dana Wakalah ke Rekening Penampung {{ rekening_penampung }} paling lambat tanggal {{ batas_setor }}."))
B.append(item("3.", "Apabila sampai dengan berakhirnya masa penghimpunan dana Proyek tidak terlaksana, Dana Wakalah dikembalikan secara utuh tanpa potongan paling lambat {{ hari_pengembalian }} hari kerja ke rekening MUWAKKIL."))

B.append(pasal(4, "Ujrah"))
B.append(item("1.", "Atas pelaksanaan kuasa berdasarkan Akad ini, WAKIL berhak atas Ujrah sebesar **{{ ujrah }}**."))
B.append(item("2.", "Ujrah dibayarkan {{ sumber_ujrah }} pada {{ waktu_ujrah }}."))
B.append(item("3.", "Besaran, cara, dan waktu pembayaran Ujrah bersifat tetap dan jelas sejak Akad ditandatangani, serta tidak dikaitkan dengan persentase keuntungan Proyek."))

B.append(pasal(5, "Hasil Proyek dan Distribusi"))
B.append(item("1.", "MUWAKKIL berhak atas Hasil Proyek secara proporsional sebesar {{ porsi_pmi }} dari total dana PMI Proyek."))
B.append(item("2.", "Proyeksi Hasil Proyek bagi MUWAKKIL adalah {{ proyeksi_hasil }}. Proyeksi ini **bukan jaminan** dan dapat berubah sesuai kemampuan bayar Nasabah."))
B.append(item("3.", "WAKIL meneruskan bagian MUWAKKIL ke rekening {{ rekening_pmi }} sesuai jadwal {{ jadwal_distribusi }}, paling lambat {{ hari_distribusi }} hari kerja setelah dana diterima dari Nasabah."))

B.append(pasal(6, "Hak dan Kewajiban WAKIL"))
for l, t in [
    ("1.", "Melaksanakan kuasa secara amanah, profesional, dan sesuai prinsip syariah serta ketentuan Akad ini."),
    ("2.", "Memisahkan Dana Wakalah dari dana operasional WAKIL dan mencatatnya per Proyek dan per PMI."),
    ("3.", "Menyampaikan laporan perkembangan Proyek kepada MUWAKKIL setiap {{ periode_laporan }}, serta segera memberitahukan kejadian material yang dapat mempengaruhi pembayaran Nasabah."),
    ("4.", "Tidak mengambil manfaat apa pun dari Dana Wakalah selain Ujrah sebagaimana Pasal 4."),
    ("5.", "Meminta persetujuan MUWAKKIL atas perubahan material syarat pembiayaan, termasuk penjadwalan ulang (reschedule) dan restrukturisasi."),
]:
    B.append(item(l, t))

B.append(pasal(7, "Hak dan Kewajiban MUWAKKIL"))
for l, t in [
    ("1.", "Menyetorkan Dana Wakalah sesuai Pasal 3 dari sumber dana yang halal dan sah."),
    ("2.", "Menerima laporan dan informasi Proyek, serta bagian Hasil Proyek sesuai Pasal 5."),
    ("3.", "Tidak menghubungi atau memberi instruksi langsung kepada Nasabah terkait Proyek tanpa sepengetahuan WAKIL."),
]:
    B.append(item(l, t))

B.append(pasal(8, "Risiko dan Tanggung Jawab"))
for l, t in [
    ("1.", "MUWAKKIL memahami bahwa penyaluran dana pada Proyek mengandung risiko, termasuk keterlambatan atau kegagalan pembayaran oleh Nasabah."),
    ("2.", "WAKIL berkedudukan sebagai pemegang amanah (yad al-amanah). Kerugian yang timbul bukan karena kesalahan WAKIL ditanggung MUWAKKIL secara proporsional sesuai porsinya."),
    ("3.", "WAKIL bertanggung jawab atas kerugian yang timbul akibat kelalaian (taqshir), tindakan melampaui kewenangan (ta’addi), atau pelanggaran syarat Akad (mukhalafat al-syuruth)."),
    ("4.", "Apabila Nasabah wanprestasi, WAKIL wajib melakukan upaya penagihan dan penyelesaian, termasuk eksekusi jaminan, dan hasilnya didistribusikan secara proporsional kepada para PMI."),
]:
    B.append(item(l, t))

B.append(pasal(9, "Jangka Waktu dan Berakhirnya Akad"))
B.append(item("1.", "Akad ini berlaku sejak ditandatangani sampai dengan seluruh kewajiban Nasabah atas Proyek selesai dan bagian MUWAKKIL telah diterima, dengan perkiraan jangka waktu {{ jangka_waktu }}."))
B.append(item("2.", "Akad berakhir lebih awal apabila Proyek batal dilaksanakan dan Dana Wakalah telah dikembalikan sesuai Pasal 3 ayat 3, atau atas kesepakatan tertulis PARA PIHAK."))

B.append(pasal(10, "Keadaan Kahar"))
B.append(para("Kegagalan atau keterlambatan pelaksanaan kewajiban karena keadaan kahar (force majeure), antara lain bencana alam, wabah, kerusuhan, atau kebijakan pemerintah, tidak dianggap sebagai pelanggaran Akad. Pihak yang mengalami wajib memberitahukan secara tertulis paling lambat 7 (tujuh) hari kerja sejak kejadian."))

B.append(pasal(11, "Kerahasiaan dan Perlindungan Data Pribadi"))
B.append(para("PARA PIHAK wajib menjaga kerahasiaan informasi Proyek, Nasabah, dan data pribadi PARA PIHAK, serta memprosesnya hanya untuk keperluan Akad ini sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi."))

B.append(pasal(12, "Penyelesaian Perselisihan"))
B.append(item("1.", "Perselisihan diselesaikan terlebih dahulu secara musyawarah untuk mufakat paling lama 30 (tiga puluh) hari."))
B.append(item("2.", "Apabila musyawarah tidak mencapai mufakat, PARA PIHAK sepakat menyelesaikannya melalui {{ forum_sengketa }}."))

B.append(pasal(13, "Lain-lain"))
for l, t in [
    ("1.", "Hal yang belum diatur dalam Akad ini akan diatur dalam addendum yang merupakan bagian tidak terpisahkan dari Akad ini."),
    ("2.", "Lampiran Ringkasan Proyek merupakan bagian tidak terpisahkan dari Akad ini."),
    ("3.", "Akad ini dibuat dalam 2 (dua) rangkap asli bermeterai cukup, masing-masing mempunyai kekuatan hukum yang sama."),
]:
    B.append(item(l, t))

B.append(para("Demikian Akad ini dibuat dan ditandatangani oleh PARA PIHAK dalam keadaan sadar, tanpa paksaan, dan dengan penuh tanggung jawab.", after=240))
sig = table(
    [
        ["WAKIL", "MUWAKKIL"],
        ["Koperasi Asy-Syirkah Muamalah Indonesia", "Penanam Modal Individual"],
        ["\n\n\n{{ wakil_nama_1 }} — {{ wakil_jabatan_1 }}", "Meterai Rp10.000\n\n\n{{ nama_pmi }}"],
        ["\n\n\n{{ wakil_nama_2 }} — {{ wakil_jabatan_2 }}", "Saksi:\n\n\n{{ saksi_1 }}"],
    ],
    [4700, 4700],
)
B.append(sig.replace("\n", "</w:t><w:br/><w:t xml:space=\"preserve\">"))
B.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
B.append(para("LAMPIRAN AKAD WAKALAH BIL UJRAH Nomor {{ nomor_akad }}", align="center", bold=True, after=0))
B.append(para("RINGKASAN PROYEK", align="center", bold=True, after=160))
B.append(table(
    [
        ["Uraian", "Keterangan"],
        ["Kode / nama proyek", "{{ kode_proyek }} — {{ nama_proyek }}"],
        ["Nasabah", "{{ nama_nasabah }}"],
        ["Akad dengan Nasabah", "{{ akad_proyek }}"],
        ["Objek pembiayaan", "{{ objek_proyek }}"],
        ["Total kebutuhan dana PMI", "Rp{{ total_dana_proyek }}"],
        ["Dana MUWAKKIL / porsi", "Rp{{ nominal_dana }} / {{ porsi_pmi }}"],
        ["Jangka waktu", "{{ jangka_waktu }}"],
        ["Proyeksi hasil MUWAKKIL", "{{ proyeksi_hasil }}"],
        ["Ujrah WAKIL", "{{ ujrah }}"],
        ["Jaminan", "{{ jaminan }}"],
        ["Nota Usulan / Executive Summary", "{{ no_nota_komite }} / {{ no_exsum }}"],
    ],
    [3400, 6000],
))

# --- rakit dokumen: pertahankan paragraf pertama (gambar kop surat) dan sectPr asli
doc = open(os.path.join(SRC, "word/document.xml"), encoding="utf8").read()
b = doc.index("<w:body>") + len("<w:body>")
e = doc.index("</w:body>")
body = doc[b:e]
paras = re.findall(r"<w:p[ >].*?</w:p>", body, flags=re.S)
kop = paras[0]  # berisi anchor gambar kop (behindDoc)
sect = body[body.rindex("<w:sectPr"):]
new = doc[:b] + kop + "".join(B) + sect + doc[e:]
work = OUT + ".dir"
if os.path.exists(work):
    shutil.rmtree(work)
shutil.copytree(SRC, work)
open(os.path.join(work, "word/document.xml"), "w", encoding="utf8").write(new)
h = os.path.join(work, "word/header1.xml")
hs = open(h, encoding="utf8").read().replace("No. 233/ASYSYIRKAH-PROPOSAL/VIII/2022", "Akad Wakalah bil Ujrah No. {{ nomor_akad }}")
open(h, "w", encoding="utf8").write(hs)
if os.path.exists(OUT):
    os.remove(OUT)
subprocess.run(["zip", "-qXr", os.path.abspath(OUT), "."], cwd=work, check=True)
shutil.rmtree(work)
print("template:", OUT)
