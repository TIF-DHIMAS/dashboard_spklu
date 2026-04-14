import numpy as np

print("=== PERHITUNGAN AHP ===")

# ======================
# MATRKS PERBANDINGAN
# (Transaksi, KBL, Kapasitas, Biaya)
# ======================
A = np.array([
    [1,   3,   3,   5],
    [1/3, 1,   1,   3],
    [1/3, 1,   1,   3],
    [1/5, 1/3, 1/3, 1]
])

# ======================
# NORMALISASI
# ======================
col_sum = A.sum(axis=0)
norm = A / col_sum

# ======================
# BOBOT (eigen approx)
# ======================
bobot = norm.mean(axis=1)

print("\nBobot AHP:")
print(bobot)

# ======================
# KONSISTENSI
# ======================
n = A.shape[0]
weighted_sum = np.dot(A, bobot)
lambda_max = np.mean(weighted_sum / bobot)

CI = (lambda_max - n) / (n - 1)

# Random Index
RI_dict = {1:0, 2:0, 3:0.58, 4:0.90}
RI = RI_dict[n]

CR = CI / RI

print("\nConsistency Ratio (CR):", CR)

# ======================
# INTERPRETASI
# ======================
if CR < 0.1:
    print("✅ Konsisten (CR < 0.1)")
else:
    print("❌ Tidak konsisten, perlu revisi matriks")