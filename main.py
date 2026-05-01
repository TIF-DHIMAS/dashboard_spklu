import pandas as pd
import numpy as np
import json
import requests
import math
from io import StringIO

URL_DATA = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=312487335&single=true&output=csv'
URL_MATRIKS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQpro3esJDAdEsGRc-UbAtwqsUony4zn4jb6xtuAfAdEaJjtGLCkZMa75qMzi5-pnUdv3uiGfusHr_t/pub?gid=1780305250&single=true&output=csv'


def fetch_csv(url):
    res = requests.get(url)
    if res.status_code != 200 or "html" in res.text.lower():
        raise Exception("Gagal ambil CSV")
    return pd.read_csv(StringIO(res.text))


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon/2)**2)

    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))


def hitung_skor(donor_df, rec_row):
    df_temp = donor_df.copy()

    df_temp['SELISIH_CAP'] = abs(df_temp['KAPASITAS'] - rec_row['KAPASITAS'])
    df_temp['NORM_CAP'] = df_temp['SELISIH_CAP'] / (df_temp['SELISIH_CAP'].max() + 1e-9)

    df_temp['JARAK'] = df_temp.apply(
        lambda x: haversine(
            rec_row['Latitude'], rec_row['Longitude'],
            x['Latitude'], x['Longitude']
        ), axis=1
    )
    df_temp['NORM_JARAK'] = df_temp['JARAK'] / (df_temp['JARAK'].max() + 1e-9)

    alpha, beta = 0.6, 0.4
    df_temp['SKOR_AKHIR'] = alpha * df_temp['NORM_CAP'] + beta * df_temp['NORM_JARAK']

    return df_temp.sort_values('SKOR_AKHIR')


def main():
    try:
        print("START")

        # ================= AHP =================
        df_m = fetch_csv(URL_MATRIKS)
        df_m = df_m.set_index(df_m.columns[0]).astype(str)

        for col in df_m.columns:
            df_m[col] = df_m[col].str.replace(',', '.')

        df_m = df_m.apply(pd.to_numeric, errors='coerce').fillna(0)

        matrix = df_m.values
        weights = (matrix / matrix.sum(axis=0)).mean(axis=1)

        n = len(matrix)
        lambda_max = np.mean(np.dot(matrix, weights) / weights)
        ci = (lambda_max - n) / (n - 1)
        cr = ci / 1.12

        # ================= DATA =================
        df = fetch_csv(URL_DATA)
        df.columns = df.columns.str.strip()

        mapping = {
            'RATA2TRANSAKSI': 'Transaksi',
            'KBLBB': 'Pengguna EV',
            'KAPASITAS': 'Kapasitas',
            'BIAYA': 'Biaya',
            'UMUR': 'Umur'
        }

        keys = list(mapping.keys())

        for col in keys:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', '.'), errors='coerce').fillna(0)

        mat = df[keys].values

       # ================= TOPSIS =================

        # Normalisasi
        norm = mat / np.sqrt((mat ** 2).sum(axis=0) + 1e-9)

        # Pembobotan
        weighted = norm * weights

        # Tentukan benefit & cost
        benefit_idx = [0, 1, 2]   # Transaksi, EV, Kapasitas
        cost_idx = [3, 4]         # Biaya, Umur

        # Solusi ideal positif & negatif
        ideal_pos = np.zeros(weighted.shape[1])
        ideal_neg = np.zeros(weighted.shape[1])

        for i in range(weighted.shape[1]):
                if i in benefit_idx:
                    ideal_pos[i] = weighted[:, i].max()
                    ideal_neg[i] = weighted[:, i].min()
                else:
                    ideal_pos[i] = weighted[:, i].min()
                    ideal_neg[i] = weighted[:, i].max()

        # Jarak ke solusi ideal
        d_pos = np.sqrt(((weighted - ideal_pos) ** 2).sum(axis=1))
        d_neg = np.sqrt(((weighted - ideal_neg) ** 2).sum(axis=1))

        # Nilai preferensi (TOPSIS score)
        score = d_neg / (d_pos + d_neg + 1e-9)

        df['SCORE'] = score
        # ================= REKOMENDASI =================
        # gunakan distribusi data (quantile)
        q_high = df['SCORE'].quantile(0.8)
        q_low = df['SCORE'].quantile(0.2)

        def rekom(row):
                if row['SCORE'] >= q_high:
                    return "TAMBAH UNIT"
                elif row['SCORE'] <= q_low:
                    return "POTENSI RELOKASI"
                else:
                    return "OPTIMAL"

        df['REKOMENDASI'] = df.apply(rekom, axis=1)
        df['REKOMENDASI_DETAIL'] = df['REKOMENDASI']
        df['PENGGANTI_LOKASI'] = "-"

        penerima = df[df['REKOMENDASI'] == 'TAMBAH UNIT']
        donor = df[df['REKOMENDASI'] == 'POTENSI RELOKASI']

        used_donor = set()

        for i, rec in penerima.iterrows():

            donor_same = donor[
                (donor['UP3'] == rec['UP3']) &
                (~donor.index.isin(used_donor))
            ]

            kandidat = None

            if not donor_same.empty:
                kandidat = hitung_skor(donor_same, rec)
            else:
                donor_lain = donor[~donor.index.isin(used_donor)]
                if not donor_lain.empty:
                    kandidat = hitung_skor(donor_lain, rec)

            if kandidat is None or kandidat.empty:
                continue

            best = kandidat.iloc[0]
            used_donor.add(best.name)

            # update penerima
            df.loc[i, 'REKOMENDASI_DETAIL'] = (
                f"TAMBAH UNIT (Dari: {best['ID_SPKLU']} - {best['Nama Stasiun']}, {best['KAPASITAS']} kW)"
            )

            # update donor
            df.loc[best.name, 'REKOMENDASI_DETAIL'] = (
                f"POTENSI RELOKASI (Ke: {rec['ID_SPKLU']} - {rec['Nama Stasiun']})"
            )

            # cari pengganti (SCORE terendah di UP3 yang sama)
            kandidat_pengganti = df[
                (df['UP3'] == best['UP3']) &
                (df.index != best.name)
            ]

            if not kandidat_pengganti.empty:
                pengganti = kandidat_pengganti.sort_values('SCORE').iloc[0]

                df.loc[best.name, 'PENGGANTI_LOKASI'] = (
                    f"Gantikan oleh: {pengganti['ID_SPKLU']} - {pengganti['Nama Stasiun']}"
                )

        df = df.sort_values(by='SCORE', ascending=False)

        # ================= OUTPUT =================
        ahp_output = {
            "cr": round(float(cr), 6),
            "is_consistent": bool(cr < 0.1),
            "weights": {
                mapping[k]: round(float(w), 6)
                for k, w in zip(keys, weights)
            }
        }

        with open('ahp_results.json', 'w') as f:
            json.dump(ahp_output, f, indent=4)

        df.to_json('data_spklu.json', orient='records', indent=4)

        print("SUCCESS")

    except Exception as e:
        print("ERROR:", e)

        with open('ahp_results.json', 'w') as f:
            json.dump({"error": str(e)}, f)

        with open('data_spklu.json', 'w') as f:
            json.dump([], f)


if __name__ == "__main__":
    main()
