import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

# URL CSV dari Google Sheets Anda
URL_OLAH = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'
def hitung_ahp_ilmiah():
    # Matriks Perbandingan Berpasangan (Sesuai Kriteria Anda)
    # 1.Rata2Trans, 2.KBLBB, 3.Kapasitas, 4.Biaya, 5.Umur
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
    ri = 1.12 # Random Index untuk n=5
    cr = ci / ri
    
    return weights, cr

def hitung_topsis(df, weights):
    kriteria = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']
    # 1 = Benefit (makin besar makin bagus), 0 = Cost (makin kecil makin bagus)
    is_benefit = [1, 1, 1, 0, 0] 
    
    # 1. Matriks Keputusan
    matrix = df[kriteria].values.astype(float)
    
    # 2. Normalisasi
    norm_matrix = matrix / np.sqrt((matrix**2).sum(axis=0))
    
    # 3. Normalisasi Terbobot
    weighted_matrix = norm_matrix * weights
    
    # 4. Solusi Ideal Positif (A+) & Negatif (A-)
    a_plus = [np.max(weighted_matrix[:, i]) if is_benefit[i] else np.min(weighted_matrix[:, i]) for i in range(len(kriteria))]
    a_minus = [np.min(weighted_matrix[:, i]) if is_benefit[i] else np.max(weighted_matrix[:, i]) for i in range(len(kriteria))]
    
    # 5. Jarak Euclidean
    d_plus = np.sqrt(((weighted_matrix - a_plus)**2).sum(axis=1))
    d_minus = np.sqrt(((weighted_matrix - a_minus)**2).sum(axis=1))
    
    # 6. Skor Preferensi
    return d_minus / (d_plus + d_minus)

def main():
    # Ambil Data
    response = requests.get(URL_OLAH)
    df = pd.read_csv(StringIO(response.text))
    
    # Hitung AHP
    weights, cr = hitung_ahp_ilmiah()
    print(f"Consistency Ratio (CR): {cr:.4f}")
    
    if cr > 0.1:
        print("Peringatan: Matriks AHP tidak konsisten!")
        return

    # Hitung TOPSIS
    df['score'] = hitung_topsis(df, weights)
    df = df.sort_values(by='score', ascending=False)

    # Logika Rekomendasi Dinamis
    donor_pool = df[df['score'] < df['score'].median()]['Nama Stasiun'].tolist()
    
    def buat_saran(row):
        if row['RATA2TRANSAKSI'] >= 50:
            donor = donor_pool.pop() if donor_pool else "Unit Baru"
            return f"TAMBAH UNIT (Pindahkan mesin dari {donor})"
        elif row['score'] < 0.2:
            return "KANDIDAT RELOKASI (Jarang digunakan)"
        return "Optimal"

    df['REKOMENDASI'] = df.apply(buat_saran, axis=1)

    # Export ke JSON untuk dibaca Javascript
    df.to_json('data_spklu.json', orient='records')
    print("Perhitungan selesai dan data_spklu.json telah diperbarui.")

if __name__ == "__main__":
    main()
