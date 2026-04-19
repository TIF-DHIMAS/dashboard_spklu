import pandas as pd
import numpy as np
import json
import requests
import os
from io import StringIO

URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'


def fetch_csv(url):
    res = requests.get(url)
    if res.status_code != 200 or "html" in res.text.lower():
        raise Exception("Gagal ambil CSV dari Google Sheets")
    return pd.read_csv(StringIO(res.text))


def main():
    try:
        print("=== START PROCESS ===")

        # ======================
        # 1. AHP
        # ======================
        print("Ambil matriks AHP...")
        df_m = fetch_csv(URL_MATRIKS)

        if df_m.empty:
            raise Exception("Matriks AHP kosong")

        # set index
        df_m = df_m.set_index(df_m.columns[0])

        # bersihkan data (koma -> titik)
        df_m = df_m.astype(str)
        
        for col in df_m.columns:
            df_m[col] = df_m[col].str.strip().str.replace(',', '.', regex=False)
            
        df_m = df_m.apply(pd.to_numeric, errors='coerce').fillna(0)
        
        matrix = df_m.values

        # hitung bobot AHP
        weights = (matrix / matrix.sum(axis=0)).mean(axis=1)

        n = len(matrix)
        ws_vector = np.dot(matrix, weights)
        lambda_max = np.mean(ws_vector / weights)
        ci = (lambda_max - n) / (n - 1)
        ri = 1.12
        cr = ci / ri

        print(f"CR: {cr}")

        # ======================
        # 2. DATA SPKLU
        # ======================
        print("Ambil data SPKLU...")
        df = fetch_csv(URL_DATA)

        if df.empty:
            raise Exception("Data SPKLU kosong")

        df.columns = df.columns.str.strip()
        print("Kolom ditemukan:", df.columns.tolist())

        mapping = {
            'RATA2TRANSAKS': 'Transaksi',
            'KBLBB': 'Pengguna EV',
            'KAPASITAS': 'Kapasitas',
            'BIAYA': 'Biaya',
            'UMUR': 'Umur'
        }

        kriteria_keys = list(mapping.keys())

        # validasi kolom
        for col in kriteria_keys:
            if col not in df.columns:
                raise Exception(f"Kolom '{col}' tidak ditemukan di data")

        # bersihkan data angka
        for col in kriteria_keys:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.strip().str.replace(',', '.'),
                errors='coerce'
            ).fillna(0)

        mat = df[kriteria_keys].values

        # ======================
        # 3. TOPSIS
        # ======================
        norm = mat / np.sqrt((mat ** 2).sum(axis=0) + 1e-9)
        weighted = norm * weights

        score = (
            weighted[:, 0] +
            weighted[:, 1] +
            weighted[:, 2]
        ) - (
            weighted[:, 3] +
            weighted[:, 4]
        )

        df['SCORE'] = (score - score.min()) / (score.max() - score.min() + 1e-9)

        # ======================
        # 4. REKOMENDASI
        # ======================
        def rekom(row):
            if row['RATA2TRANSAKS'] >= 30:
                return "TAMBAH UNIT"
            elif row['SCORE'] < 0.3:
                return "RELOKASI"
            else:
                return "OPTIMAL"

        df['REKOMENDASI'] = df.apply(rekom, axis=1)

        df = df.sort_values(by='SCORE', ascending=False)

        # ======================
        # 5. OUTPUT JSON
        # ======================
        ahp_output = {
            "cr": round(float(cr), 6),
            "is_consistent": bool(cr < 0.1),
            "weights": {
                mapping[k]: round(float(w), 6)
                for k, w in zip(kriteria_keys, weights)
            }
        }

        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_output, f, indent=4)

        df.to_json('data_spklu.json', orient='records', indent=4)

        print("=== SUCCESS ===")

    except Exception as e:
        print("ERROR:", e)

        # fallback supaya tidak kosong error
        with open('ahp_results.json', 'w') as f:
            json.dump({"error": str(e)}, f, indent=4)

        with open('data_spklu.json', 'w') as f:
            json.dump([], f, indent=4)


if __name__ == "__main__":
    main()
