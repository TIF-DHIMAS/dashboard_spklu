import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

# URL CSV dari Google Sheets
URL_OLAH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'

def hitung_ahp_ilmiah():
    """
    Menghitung bobot kriteria menggunakan metode AHP.
    Urutan: 1.Rata2Trans, 2.KBLBB, 3.Kapasitas, 4.Biaya, 5.Umur
    """
    # Nama Tampilan (Label untuk Dashboard)
    names = ['Rata2 Transaksi', 'Populasi KBLBB', 'Kapasitas', 'Biaya Ops', 'Umur Aset']
    
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
    
    return weights, cr, names

def hitung_topsis(df, weights):
    """
    Menghitung ranking menggunakan metode TOPSIS
    """
    # Nama kolom teknis di Google Sheets
    kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    # 1 = Benefit, 0 = Cost
    is_benefit = [1, 1, 1, 0, 0] 
    
    matrix = df[kriteria].values.astype(float)
    
    # 1. Normalisasi
    norm_matrix = matrix / np.sqrt((matrix**2).sum(axis=0))
    
    # 2. Normalisasi Terbobot
    weighted_matrix = norm_matrix * weights
    
    # 3. Solusi Ideal
    a_plus = [np.max(weighted_matrix[:, i]) if is_benefit[i] else np.min(weighted_matrix[:, i]) for i in range(len(kriteria))]
    a_minus = [np.min(weighted_matrix[:, i]) if is_benefit[i] else np.max(weighted_matrix[:, i]) for i in range(len(kriteria))]
    
    # 4. Jarak Euclidean
    d_plus = np.sqrt(((weighted_matrix - a_plus)**2).sum(axis=1))
    d_minus = np.sqrt(((weighted_matrix - a_minus)**2).sum(axis=1))
    
    return d_minus / (d_plus + d_minus)

def main():
    print("Memulai proses pengambilan data...")
    try:
        response = requests.get(URL_OLAH)
        response.raise_for_status()
    except Exception as e:
        print(f"Gagal mengambil data: {e}")
        return

    # Load data
    df = pd.read_csv(StringIO(response.text))

    # --- PEMBERSIHAN DATA ---
    df = df.dropna(subset=['Nama Stasiun'])
    
    kriteria_cols = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    for col in kriteria_cols:
        if col in df.columns:
            # Bersihkan format angka (koma ke titik)
            df[col] = df[col].astype(str).str.replace(',', '.').str.strip()
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # --- PERHITUNGAN AHP ---
    weights, cr, names = hitung_ahp_ilmiah()
    
    # Fix: Paksa konversi ke tipe data Python Native (float & bool) untuk JSON
    ahp_results = {
        "consistency_ratio": float(round(cr, 4)),
        "is_consistent": bool(cr < 0.1),
        "details": [
            {
                "kriteria": str(n),
                "bobot": float(round(w * 100, 2))
            } for n, w in zip(names, weights)
        ]
    }
    
    with open('ahp_results.json', 'w') as f:
        json.dump(ahp_results, f, indent=4)
    print("File ahp_results.json berhasil dibuat.")

    # --- PERHITUNGAN TOPSIS ---
    df['score'] = hitung_topsis(df, weights)
    df = df.sort_values(by='score', ascending=False)

    # --- LOGIKA REKOMENDASI ---
    median_score = df['score'].median()
    # Ambil pool donor (skor di bawah median)
    donor_pool = df[df['score'] < median_score]['Nama Stasiun'].tolist()
    
    def tentukan_rekomendasi(row):
        # Berdasarkan koreksi user: "jumlah transaksi aja"
        if row['RATA2TRANSAKSI'] >= 30:
            donor = donor_pool.pop() if donor_pool else "Unit Baru"
            return f"TAMBAH UNIT (Dari {donor})"
        elif row['score'] < 0.2:
            return "KANDIDAT RELOKASI"
        else:
            return "Optimal"

    df['REKOMENDASI'] = df.apply(tentukan_rekomendasi, axis=1)

    # --- SIMPAN HASIL UTAMA ---
    # Konversi DataFrame ke JSON Records
    df.to_json('data_spklu.json', orient='records', double_precision=4)
    
    print(f"Proses Berhasil! Skor CR: {cr:.4f}")
    print("File data_spklu.json telah diperbarui.")

if __name__ == "__main__":
    main()
