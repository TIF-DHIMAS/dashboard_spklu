import pandas as pd
import numpy as np
import json
import os

print("=== PROSES TOPSIS SPKLU ===")

# ======================
# LOAD DATA
# ======================
try:
    df = pd.read_excel("spklu.xlsx")
except:
    print("❌ File spklu.xlsx tidak ditemukan")
    exit()

# ======================
# AMBIL DATA NUMERIK
# ======================
data = df[['TRANSAKSI', 'KBL', 'KAPASITAS', 'BIAYA']].values

# ======================
# BOBOT (HASIL AHP)
# ======================
bobot = np.array([0.519, 0.201, 0.201, 0.079])

# 1 = benefit, 0 = cost
kriteria = np.array([1, 1, 1, 0])

# ======================
# NORMALISASI
# ======================
norm = data / np.sqrt((data**2).sum(axis=0))

# ======================
# NORMALISASI BERBOBOT
# ======================
weighted = norm * bobot

# ======================
# SOLUSI IDEAL
# ======================
ideal_pos = np.max(weighted, axis=0)
ideal_neg = np.min(weighted, axis=0)

# Penyesuaian cost
for i in range(len(kriteria)):
    if kriteria[i] == 0:
        ideal_pos[i] = np.min(weighted[:, i])
        ideal_neg[i] = np.max(weighted[:, i])

# ======================
# HITUNG JARAK
# ======================
d_pos = np.sqrt(((weighted - ideal_pos)**2).sum(axis=1))
d_neg = np.sqrt(((weighted - ideal_neg)**2).sum(axis=1))

# ======================
# SKOR TOPSIS
# ======================
skor = d_neg / (d_pos + d_neg)

df['Skor'] = skor
df['Ranking'] = df['Skor'].rank(ascending=False)

# ======================
# KATEGORI
# ======================
df['Kategori'] = pd.cut(df['Skor'],
                       bins=[0, 0.4, 0.7, 1],
                       labels=['Critical', 'Evaluasi', 'Optimal'])

# Urutkan
df = df.sort_values(by='Skor', ascending=False)

print("\n=== HASIL RANKING ===")
print(df[['NAMA','Skor','Ranking','Kategori']])

# ======================
# EXPORT JSON
# ======================
topsis_json = []

for _, row in df.iterrows():
    topsis_json.append({
        "nama": row["NAMA"],
        "skor": float(row["Skor"]),
        "kategori": str(row["Kategori"])
    })

# pastikan folder ada
os.makedirs("data", exist_ok=True)

with open("data/topsis.json", "w") as f:
    json.dump(topsis_json, f, indent=4)

print("\n✅ JSON berhasil dibuat: data/topsis.json")

# ======================
# AUTO PUSH GITHUB
# ======================
try:
    repo_path = r"C:\Users\dhimas.wahyu\SPKLU_PROJECT"  # GANTI SESUAI

    os.chdir(repo_path)

    os.system("git add data/topsis.json")
    os.system('git commit -m "update topsis otomatis"')
    os.system("git push")

    print("🚀 Berhasil push ke GitHub")

except:
    print("⚠️ Gagal push GitHub (cek path / git login)")