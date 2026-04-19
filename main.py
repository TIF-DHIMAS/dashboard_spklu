import pandas as pd
import numpy as np
import json
import requests
from io import StringIO

URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'


def fetch_csv(url):
    res = requests.get(url)
    return pd.read_csv(StringIO(res.text))


def main():
    try:
        # ======================
        # AHP
        # ======================
        df_m = fetch_csv(URL_MATRIKS)
        df_m = df_m.set_index(df_m.columns[0])

        df_m = df_m.astype(str)
        for col in df_m.columns:
            df_m[col] = pd.to_numeric(
                df_m[col].str.replace(',', '.', regex=False),
                errors='coerce'
            )

        df_m = df_m.fillna(0)
        matrix = df_m.values

        weights = (matrix / matrix.sum(axis=0)).mean(axis=1)

        n = len(matrix)
        lambda_max = np.mean(np.dot(matrix, weights) / weights)
        ci = (lambda_max - n) / (n - 1)
        ri = 1.12
        cr = ci / ri

        # ======================
        # DATA
        # ======================
        df = fetch_csv(URL_DATA)
        df.columns = df.columns.str.strip()

        cols = ['RATA2TRANSAKSI', 'KBLBB', 'KAPASITAS', 'BIAYA', 'UMUR']

        for col in cols:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace(',', '.'),
                errors='coerce'
            ).fillna(0)

        mat = df[cols].values

        norm = mat / np.sqrt((mat ** 2).sum(axis=0) + 1e-9)
        weighted = norm * weights

        score = (
            weighted[:, 0] + weighted[:, 1] + weighted[:, 2]
            - weighted[:, 3] - weighted[:, 4]
        )

        df['SCORE'] = (score - score.min()) / (score.max() - score.min() + 1e-9)

        # ======================
        # STATUS
        # ======================
        def status(row):
            if row['RATA2TRANSAKSI'] >= 30:
                return "TAMBAH UNIT"
            elif row['SCORE'] < 0.3:
                return "POTENSI RELOKASI"
            else:
                return "OPTIMAL"

        df['REKOMENDASI'] = df.apply(status, axis=1)

        df = df.sort_values(by='SCORE', ascending=False)

        # ======================
        # MATCHING DONOR
        # ======================
        df['REKOMENDASI_DETAIL'] = df['REKOMENDASI']

        penerima = df[df['REKOMENDASI'] == 'TAMBAH UNIT']
        donor = df[df['REKOMENDASI'] == 'POTENSI RELOKASI']

        for i, row in penerima.iterrows():
            if donor.empty:
                continue

            donor_copy = donor.copy()
            donor_copy['selisih'] = abs(donor_copy['KAPASITAS'] - row['KAPASITAS'])

            kandidat = donor_copy.sort_values(by=['selisih', 'SCORE']).iloc[0]

            df.at[i, 'REKOMENDASI_DETAIL'] = (
                f"Perlu tambah unit, ambil dari {kandidat['Nama Stasiun']} "
                f"({kandidat['KAPASITAS']} kW)"
            )

        for i in donor.index:
            df.at[i, 'REKOMENDASI_DETAIL'] = "Potensi relokasi ke lokasi lain"

        # ======================
        # OUTPUT
        # ======================
        ahp_output = {
            "cr": round(float(cr), 6),
            "is_consistent": bool(cr < 0.1),
            "weights": {
                "Transaksi": float(weights[0]),
                "Pengguna EV": float(weights[1]),
                "Kapasitas": float(weights[2]),
                "Biaya": float(weights[3]),
                "Umur": float(weights[4])
            }
        }

        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_output, f, indent=4)

        df.to_json('data_spklu.json', orient='records', indent=4)

    except Exception as e:
        with open('ahp_results.json', 'w') as f:
            json.dump({"error": str(e)}, f)

        with open('data_spklu.json', 'w') as f:
            json.dump([], f)


if __name__ == "__main__":
    main()
