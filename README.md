# Lokasi Tracker

Aplikasi Android untuk melihat posisi GPS dan merekam rute perjalanan.
Dibuat dengan React (Vite) dan dibungkus jadi APK memakai Capacitor.

## Fitur

- Ambil lokasi sekali tekan: latitude, longitude, akurasi, ketinggian
- Pelacakan langsung (watchPosition): rute digambar di peta OpenStreetMap
- Hitung jarak tempuh dengan rumus Haversine, durasi, kecepatan sekarang, rata-rata, dan maksimum
- Riwayat rute tersimpan di HP lewat localStorage, bisa dibuka lagi di peta dan dihapus
- Copy koordinat dan buka posisi di Google Maps
- Filter titik: titik dengan akurasi di atas 100 m dibuang, dan titik baru hanya dicatat kalau geraknya lebih dari 5 m, supaya garis rute tidak zig-zag

## Struktur kode

```
src/App.jsx              tampilan utama, state, dan logika pelacakan
src/components/MapView.jsx  peta Leaflet (titik posisi, lingkaran akurasi, garis rute)
src/lib/geo.js           Haversine, total jarak, format tampilan, simpan riwayat
src/index.css            styling, dibuat mobile first
.github/workflows/build-apk.yml  build APK otomatis di GitHub Actions
```

## Jalankan di laptop

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Browser akan minta izin lokasi.

## Build APK

APK dibuild di GitHub Actions, jadi tidak perlu install Android Studio.
Push repo ini ke GitHub, buka tab **Actions**, tunggu workflow "Build APK"
selesai, lalu download artifact `lokasi-tracker-apk`.

Kalau mau build sendiri di laptop (butuh Android Studio dan Android SDK):

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Hasilnya: `android/app/build/outputs/apk/debug/app-debug.apk`

## Catatan

- Pelacakan jalan selama aplikasi terbuka di layar. Perekaman di latar belakang
  butuh foreground service dan belum dipakai di versi ini.
- Peta butuh koneksi internet untuk mengambil tile OpenStreetMap. Angka koordinat
  tetap muncul walau internet mati.
- Data lokasi hanya disimpan di HP, tidak dikirim ke server.
