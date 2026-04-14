import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

# URL CSV dari Google Sheets (Pastikan URL ini sudah di-publish as CSV)
URL_OLAH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'
def hitung_ahp_ilmiah():
    """
    Menghitung bobot kriteria menggunakan metode AHP.
    Kriteria: 1.Rata2Trans, 2.KBLBB, 3.Kapasitas, 4.Biaya, 5.Umur
    """
    # Matriks Perbandingan Berpasangan
    matrix = np.array([
        [1, 3, 3, 5, 7],      # Rata2Trans
        [1/3, 1, 2, 4, 5],    # KBLBB
        [1/3, 1/2, 1, 3, 4],  # Kapasitas
        [1/5, 1/4, 1/3, 1, 2],# Biaya
        [1/7, 1/5, 1/4, 1/2, 1] # Umur
    ])
    
    # Hitung Bobot (Eigenvector)
    norm_matrix = matrix / matrix.sum(axis=0)
    weights = norm_matrix.mean(axis=1)
    
    # Cek Konsistensi (CR)
    n = len(matrix)
    lambda_max = np.mean(np.dot(matrix, weights) / weights)
    ci = (lambda_max - n) / (n - 1)
    ri = 1.12  # RI untuk n=5
    cr = ci / ri
    
    return weights, cr

def hitung_topsis(df, weights):
    """
    Menghitung ranking menggunakan metode TOPSIS
    """
    kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    # 1 = Benefit (makin besar makin baik), 0 = Cost (makin kecil makin baik)
    is_benefit = [1, 1, 1, 0, 0] 
    
    # Ambil matriks keputusan
    matrix = df[kriteria].values.astype(float)
    
    # 1. Normalisasi Matriks
    norm_matrix = matrix / np.sqrt((matrix**2).sum(axis=0))
    
    # 2. Normalisasi Terbobot
    weighted_matrix = norm_matrix * weights
    
    # 3. Solusi Ideal Positif (A+) dan Negatif (A-)
    a_plus = [np.max(weighted_matrix[:, i]) if is_benefit[i] else np.min(weighted_matrix[:, i]) for i in range(len(kriteria))]
    a_minus = [np.min(weighted_matrix[:, i]) if is_benefit[i] else np.max(weighted_matrix[:, i]) for i in range(len(kriteria))]
    
    # 4. Jarak Euclidean (D+ dan D-)
    d_plus = np.sqrt(((weighted_matrix - a_plus)**2).sum(axis=1))
    d_minus = np.sqrt(((weighted_matrix - a_minus)**2).sum(axis=1))
    
    # 5. Nilai Preferensi (Skor Akhir)
    score = d_minus / (d_plus + d_minus)
    return score

def main():
    print("Memulai proses pengambilan data...")
    response = requests.get(URL_OLAH)
    if response.status_code != 200:
        print("Gagal mengambil data dari Google Sheets!")
        return

    # Load data ke DataFrame
    df = pd.read_csv(StringIO(response.text))

    # --- PEMBERSIHAN DATA ---
    # 1. Buang baris yang tidak memiliki Nama Stasiun (baris kosong di bawah GSheet)
    df = df.dropna(subset=['Nama Stasiun'])

    # 2. Konversi kolom kriteria ke angka (Koma jadi Titik)
    kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    for col in kriteria:
        if col in df.columns:
            # Ganti koma dengan titik, bersihkan spasi, lalu ubah ke float
            df[col] = df[col].astype(str).str.replace(',', '.').str.strip()
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # --- PERHITUNGAN ---
    # 1. Hitung Bobot AHP
    weights, cr = hitung_ahp_ilmiah()
    print(f"Consistency Ratio (CR): {cr:.4f}")
    
    if cr > 0.1:
        print("Peringatan: Matriks AHP tidak konsisten!")

    # 2. Hitung Ranking TOPSIS
    df['score'] = hitung_topsis(df, weights)
    
    # 3. Sorting berdasarkan skor tertinggi
    df = df.sort_values(by='score', ascending=False)

    # --- LOGIKA REKOMENDASI ---
    # Ambil daftar stasiun dengan skor terendah sebagai kandidat donor relokasi
    donor_pool = df[df['score'] < df['score'].median()]['Nama Stasiun'].tolist()
    
    def tentukan_rekomendasi(row):
        # Jika transaksi tinggi (misal > 30), perlu tambah unit
        if row['RATA2TRANSAKSI'] >= 30:
            donor = donor_pool.pop() if donor_pool else "Unit Baru"
            return f"TAMBAH UNIT (Pindahkan mesin dari {donor})"
        # Jika skor kelayakan sangat rendah (misal < 0.2), kandidat relokasi
        elif row['score'] < 0.2:
            return "KANDIDAT RELOKASI (Efektivitas Rendah)"
        else:
            return "Optimal"

    df['REKOMENDASI'] = df.apply(tentukan_rekomendasi, axis=1)

    # --- SIMPAN HASIL ---
    # Simpan ke JSON untuk dibaca oleh JavaScript (app.js)
    result_json = df.to_json(orient='records')
    with open('data_spklu.json', 'w') as f:
        f.write(result_json)
    
    print("Proses Berhasil! File data_spklu.json telah diperbarui.")

if __name__ == "__main__":
    main()
