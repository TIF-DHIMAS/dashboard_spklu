import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

# URL CSV Data Transaksi (Data Utama)
URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'

# URL CSV Matriks AHP (Sheet yang berisi tabel 5x5 hasil Geometric Mean)
# Ganti GID_MATRIKS dengan ID sheet tempat tabel matriks Anda berada
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'
def hitung_ahp_otomatis():
    """
    Menghitung bobot kriteria dengan mengambil matriks langsung dari Google Sheets.
    """
    print("Mengambil matriks perbandingan dari spreadsheet...")
    response = requests.get(URL_MATRIKS)
    # Membaca matriks, mengabaikan kolom header pertama (nama kriteria)
    df_matriks = pd.read_csv(StringIO(response.text), index_col=0)
    
    # Konversi ke NumPy array dan pastikan tipe datanya float
    # Ini akan menangani format pecahan seperti 1/3.56 jika di sheet berupa hasil hitung
    matrix = df_matriks.values.astype(float)
    
    names = df_matriks.columns.tolist()
    
    # --- LOGIKA HITUNG AHP ---
    column_sums = matrix.sum(axis=0)
    norm_matrix = matrix / column_sums
    weights = norm_matrix.mean(axis=1)
    
    # Cek Konsistensi (CR)
    n = len(matrix)
    weighted_sum_vector = np.dot(matrix, weights)
    consistency_vector = weighted_sum_vector / weights
    lambda_max = np.mean(consistency_vector)
    
    ci = (lambda_max - n) / (n - 1)
    ri = 1.12 
    cr = ci / ri
    
    return weights, cr, names

def hitung_topsis(df, weights):
    """
    Menghitung ranking menggunakan metode TOPSIS (Benefit & Cost)
    """
    # Kolom kriteria sesuai urutan matriks
    kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    is_benefit = [1, 1, 1, 0, 0] 
    
    matrix = df[kriteria].values.astype(float)
    
    # 1. Normalisasi
    norm_matrix = matrix / np.sqrt((matrix**2).sum(axis=0))
    
    # 2. Bobot
    weighted_matrix = norm_matrix * weights
    
    # 3. Solusi Ideal
    a_plus = [np.max(weighted_matrix[:, i]) if is_benefit[i] else np.min(weighted_matrix[:, i]) for i in range(len(kriteria))]
    a_minus = [np.min(weighted_matrix[:, i]) if is_benefit[i] else np.max(weighted_matrix[:, i]) for i in range(len(kriteria))]
    
    # 4. Jarak & Skor
    d_plus = np.sqrt(((weighted_matrix - a_plus)**2).sum(axis=1))
    d_minus = np.sqrt(((weighted_matrix - a_minus)**2).sum(axis=1))
    
    return d_minus / (d_plus + d_minus)

def main():
    try:
        # 1. Hitung AHP dari Matriks di Spreadsheet
        weights, cr, names = hitung_ahp_otomatis()
        
        # 2. Ambil Data SPKLU untuk TOPSIS
        response = requests.get(URL_DATA)
        df = pd.read_csv(StringIO(response.text))
        
        # --- CLEANING ---
        df = df.dropna(subset=['Nama Stasiun'])
        for col in ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']:
            df[col] = df[col].astype(str).str.replace(',', '.').str.strip()
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # --- TOPSIS ---
        df['score'] = hitung_topsis(df, weights)
        df = df.sort_values(by='score', ascending=False)

        # --- OUTPUT ---
        ahp_results = {
            "cr": round(cr, 4),
            "consistent": bool(cr < 0.1),
            "weights": {n: round(w, 4) for n, w in zip(names, weights)}
        }
        
        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_results, f, indent=4)
            
        df.to_json('data_spklu.json', orient='records', double_precision=4)
        
        print(f"Selesai! CR: {cr:.4f}")
        print("Bobot yang digunakan:", ahp_results["weights"])

    except Exception as e:
        print(f"Terjadi kesalahan: {e}")

if __name__ == "__main__":
    main()
