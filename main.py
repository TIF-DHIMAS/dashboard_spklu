import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

# URL CSV Data Transaksi (Data Utama)
URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'

# URL CSV Matriks AHP (Sheet yang berisi tabel 5x5 hasil Geometric Mean)
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'
def hitung_ahp_otomatis():
    """
    Menghitung bobot kriteria dengan mengambil matriks langsung dari Google Sheets.
    """
    print("Mengambil matriks perbandingan dari spreadsheet...")
    response = requests.get(URL_MATRIKS)
    
    # Membaca matriks dengan presisi tinggi agar sinkron dengan Excel
    df_matriks = pd.read_csv(StringIO(response.text), index_col=0, float_precision='high')
    
    # Konversi ke NumPy array
    matrix = df_matriks.values.astype(float)
    names = df_matriks.columns.tolist()
    
    # --- LOGIKA HITUNG AHP (Metode Normalisasi Rata-rata Baris) ---
    column_sums = matrix.sum(axis=0)
    norm_matrix = matrix / column_sums
    weights = norm_matrix.mean(axis=1)
    
    # --- CEK KONSISTENSI (CR) ---
    n = len(matrix)
    # Weighted Sum Vector (WSV) menggunakan perkalian matriks asli dan bobot
    weighted_sum_vector = np.dot(matrix, weights)
    # Consistency Vector (CV)
    consistency_vector = weighted_sum_vector / weights
    # Lambda Max (Nilai rata-rata CV)
    lambda_max = np.mean(consistency_vector)
    
    # Indeks Konsistensi (CI)
    ci = (lambda_max - n) / (n - 1)
    # Rasio Konsistensi (RI) untuk n=5 adalah 1.12
    ri = 1.12 
    cr = ci / ri
    
    return weights, cr, names, lambda_max

def hitung_topsis(df, weights):
    """
    Menghitung ranking menggunakan metode TOPSIS (Benefit & Cost)
    """
    # Kolom kriteria sesuai urutan (Pastikan Nama Kolom di CSV Sesuai)
    kriteria_cols = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    # 1 = Benefit (Makin besar makin baik), 0 = Cost (Makin kecil makin baik)
    is_benefit = [1, 1, 1, 0, 0] 
    
    matrix = df[kriteria_cols].values.astype(float)
    
    # 1. Normalisasi Matriks (Metode Euclidean)
    norm_matrix = matrix / np.sqrt((matrix**2).sum(axis=0))
    
    # 2. Normalisasi Terbobot
    weighted_matrix = norm_matrix * weights
    
    # 3. Menentukan Solusi Ideal Positif (A+) dan Negatif (A-)
    a_plus = [np.max(weighted_matrix[:, i]) if is_benefit[i] else np.min(weighted_matrix[:, i]) for i in range(len(kriteria_cols))]
    a_minus = [np.min(weighted_matrix[:, i]) if is_benefit[i] else np.max(weighted_matrix[:, i]) for i in range(len(kriteria_cols))]
    
    # 4. Menghitung Jarak Solusi (D+ dan D-)
    d_plus = np.sqrt(((weighted_matrix - a_plus)**2).sum(axis=1))
    d_minus = np.sqrt(((weighted_matrix - a_minus)**2).sum(axis=1))
    
    # 5. Menghitung Skor Preferensi (Nilai Kedekatan)
    # Menghindari pembagian dengan nol jika ada data yang identik
    score = d_minus / (d_plus + d_minus)
    return score

def main():
    try:
        # 1. Hitung AHP (Uji Konsistensi)
        weights, cr, names, lambda_max = hitung_ahp_otomatis()
        
        # 2. Ambil Data SPKLU untuk TOPSIS
        response = requests.get(URL_DATA)
        df = pd.read_csv(StringIO(response.text))
        
        # --- DATA CLEANING ---
        # Membersihkan spasi di nama kolom agar tidak terjadi KeyError
        df.columns = df.columns.str.strip().str.upper().str.replace(' ', '')
        
        # Mapping kriteria teknis
        target_cols = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
        
        # Hapus baris kosong dan bersihkan format angka (koma ke titik)
        df = df.dropna(subset=['NAMASTASIUN'])
        for col in target_cols:
            df[col] = df[col].astype(str).str.replace(',', '.').str.strip()
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # --- EKSEKUSI TOPSIS ---
        df['SCORE'] = hitung_topsis(df, weights)
        # Urutkan dari skor tertinggi (Rekomendasi Utama) ke terendah
        df = df.sort_values(by='SCORE', ascending=False)

        # --- OUTPUT HASIL ---
        ahp_summary = {
            "lambda_max": round(lambda_max, 6),
            "cr": round(cr, 6),
            "is_consistent": bool(cr < 0.1),
            "weights": {n: round(w, 6) for n, w in zip(names, weights)}
        }
        
        # Simpan hasil analisis kriteria (AHP)
        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_summary, f, indent=4)
            
        # Simpan hasil perankingan alternatif (TOPSIS)
        df.to_json('data_spklu.json', orient='records', double_precision=6)
        
        print("-" * 30)
        print(f"ANALISIS SELESAI")
        print(f"Consistency Ratio (CR): {cr:.6f}")
        print(f"Status: {'KONSISTEN' if cr < 0.1 else 'TIDAK KONSISTEN'}")
        print("-" * 30)
        print("Bobot Kriteria:", ahp_summary["weights"])

    except Exception as e:
        print(f"Terjadi kesalahan teknis: {e}")

if __name__ == "__main__":
    main()
