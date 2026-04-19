import pandas as pd
import numpy as np
import json
import requests
import os
from io import StringIO

# URL CSV dari Google Sheets Anda
URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'

def main():
    try:
        print("Mengambil data terbaru...")
        
        # 1. HITUNG AHP DINAMIS (Matriks GEOMAN)
        res_m = requests.get(URL_MATRIKS)
        df_m = pd.read_csv(StringIO(res_m.text), index_col=0)
        matrix = df_m.values.astype(float)
        
        # Hitung Eigenvector (Bobot)
        weights = (matrix / matrix.sum(axis=0)).mean(axis=1)
        
        # Hitung CR otomatis (Target: 0.0252)
        n = len(matrix)
        ws_vector = np.dot(matrix, weights)
        consistency_vector = ws_vector / weights
        lambda_max = np.mean(consistency_vector)
        ci = (lambda_max - n) / (n - 1)
        ri = 1.12 
        calculated_cr = ci / ri

        # 2. PROSES DATA SPKLU (TOPSIS)
        res_d = requests.get(URL_DATA)
        df = pd.read_csv(StringIO(res_d.text))
        df.columns = df.columns.str.strip()
        
        # Mapping kolom sesuai image_61071f.png
        mapping = {
            'RATA2TRANSAKS': 'Transaksi',
            'KBLBB': 'Pengguna EV',
            'KAPASITAS': 'Kapasitas',
            'BIAYA': 'Biaya',
            'UMUR': 'Umur'
        }
        
        kriteria_keys = list(mapping.keys())
        for col in kriteria_keys:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', '.'), errors='coerce').fillna(0)
        
        # Normalisasi TOPSIS
        mat = df[kriteria_keys].values.astype(float)
        norm = mat / np.sqrt((mat**2).sum(axis=0) + 1e-9)
        weighted = norm * weights
        
        # Benefit (0,1,2) & Cost (3,4)
        score = (weighted[:, 0] + weighted[:, 1] + weighted[:, 2]) - (weighted[:, 3] + weighted[:, 4])
        df['SCORE'] = (score - score.min()) / (score.max() - score.min() + 1e-9)

        # 3. LOGIKA REKOMENDASI (Transaksi >= 30)
        def beri_rekomendasi(row):
            if row['RATA2TRANSAKS'] >= 30:
                return "TAMBAH UNIT"
            elif row['SCORE'] < 0.3:
                return "KANDIDAT RELOKASI"
            else:
                return "OPTIMAL"

        df['REKOMENDASI'] = df.apply(beri_rekomendasi, axis=1)
        df = df.sort_values(by='SCORE', ascending=False)

        # 4. SIMPAN OUTPUT KE ROOT
        ahp_output = {
            "cr": round(float(calculated_cr), 6),
            "is_consistent": bool(calculated_cr < 0.1),
            "weights": {mapping[k]: round(float(w), 6) for k, w in zip(kriteria_keys, weights)}
        }
        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_output, f, indent=4)
            
        df.to_json('data_spklu.json', orient='records', double_precision=6)
        print(f"Update Berhasil! CR: {calculated_cr:.6f}")

    except Exception as e:
        print(f"Error: {e}")
        # Pastikan file dummy ada agar git add tidak gagal
        for f_name in ['data_spklu.json', 'ahp_results.json']:
            if not os.path.exists(f_name):
                with open(f_name, 'w') as f: f.write('{}')

if __name__ == "__main__":
    main()
