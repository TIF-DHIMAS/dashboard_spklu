import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

# URL CSV Data Utama (Sheet SPKLU)
URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'

# URL CSV Matriks AHP (Sheet GEOMAN)
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'

def hitung_ahp_dari_sheet():
    """
    Mengambil matriks dari Google Sheets dan menghitung bobot serta CR.
    """
    print("Mengambil matriks perbandingan dari spreadsheet...")
    response = requests.get(URL_MATRIKS)
    # Menggunakan float_precision='high' agar sinkron dengan presisi Excel
    df_matriks = pd.read_csv(StringIO(response.text), index_col=0, float_precision='high')
    
    matrix = df_matriks.values.astype(float)
    names = df_matriks.columns.tolist()
    
    # --- LOGIKA AHP ---
    column_sums = matrix.sum(axis=0)
    norm_matrix = matrix / column_sums
    weights = norm_matrix.mean(axis=1)
    
    # Cek Konsistensi (CR)
    n = len(matrix)
    weighted_sum_vector = np.dot(matrix, weights)
    consistency_vector = weighted_sum_vector / weights
    lambda_max = np.mean(consistency_vector)
    
    ci = (lambda_max - n) / (n - 1)
    ri = 1.12  # RI untuk n=5
    cr = ci / ri
    
    return weights, cr, names

def hitung_topsis(df, weights):
    """
    Menghitung ranking menggunakan metode TOPSIS
    """
    kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    is_benefit = [1, 1, 1, 0, 0] 
    
    matrix = df[kriteria].values.astype(float)
    
    # 1. Normalisasi Euclidean
    norm_matrix = matrix / np.sqrt((matrix**2).sum(axis=0))
    
    # 2. Normalisasi Terbobot
    weighted_matrix = norm_matrix * weights
    
    # 3. Solusi Ideal Positif & Negatif
    a_plus = [np.max(weighted_matrix[:, i]) if is_benefit[i] else np.min(weighted_matrix[:, i]) for i in range(len(kriteria))]
    a_minus = [np.min(weighted_matrix[:, i]) if is_benefit[i] else np.max(weighted_matrix[:, i]) for i in range(len(kriteria))]
    
    # 4. Jarak Euclidean
    d_plus = np.sqrt(((weighted_matrix - a_plus)**2).sum(axis=1))
    d_minus = np.sqrt(((weighted_matrix - a_minus)**2).sum(axis=1))
    
    return d_minus / (d_plus + d_minus)

def main():
    try:
        # 1. PERHITUNGAN AHP
        weights, cr, names = hitung_ahp_dari_sheet()
        
        ahp_results = {
            "consistency_ratio": float(round(cr, 6)),
            "is_consistent": bool(cr < 0.1),
            "details": [
                {"kriteria": str(n), "bobot": float(round(w * 100, 4))} 
                for n, w in zip(names, weights)
            ]
        }
        
        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_results, f, indent=4)

        # 2. LOAD & CLEAN DATA SPKLU
        response = requests.get(URL_DATA)
        df = pd.read_csv(StringIO(response.text))
        
        # Bersihkan nama kolom (Hapus spasi, jadikan UPPER)
        df.columns = df.columns.str.strip().str.upper().str.replace(' ', '')
        
        df = df.dropna(subset=['NAMASTASIUN'])
        kriteria_cols = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
        for col in kriteria_cols:
            df[col] = df[col].astype(str).str.replace(',', '.').str.strip()
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # 3. PERHITUNGAN TOPSIS
        df['SCORE'] = hitung_topsis(df, weights)
        df = df.sort_values(by='SCORE', ascending=False)

        # 4. LOGIKA REKOMENDASI (Berdasarkan Koreksi User: Transaksi >= 30)
        def tentukan_rekomendasi(row):
            if row['RATA2TRANSAKSI'] >= 30:
                return "TAMBAH UNIT"
            elif row['SCORE'] < 0.3: # Threshold penyesuaian
                return "KANDIDAT RELOKASI"
            else:
                return "OPTIMAL"

        df['REKOMENDASI'] = df.apply(tentukan_rekomendasi, axis=1)

        # 5. SIMPAN HASIL (Direktori Root)
        df.to_json('data_spklu.json', orient='records', double_precision=6)
        
        print(f"Selesai! CR: {cr:.6f} (Sejalan dengan Excel)")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
