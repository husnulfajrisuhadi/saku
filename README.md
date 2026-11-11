# Saku

Pemutar MP3 web bergaya retro (layar LCD + tombol fisik), mobile-first, untuk file lagu milik sendiri.

- Impor MP3/M4A/AAC/WAV/FLAC dari iPhone, tersimpan offline di browser (IndexedDB).
- Kontrol di lock screen & Control Center (Media Session API): play/pause, next, previous, scrub.
- Acak, ulangi semua / ulangi satu, maju-mundur 10 detik, cari, urut terbaru / A–Z.
- Baca judul, artis, album, dan sampul dari tag ID3.
- Opsional: login Google untuk mencadangkan lagu ke folder "Saku" di Google Drive masing-masing pengguna (scope `drive.file`), lalu mengunduhnya lagi di perangkat lain.

## Teknis

Static site tanpa build step. Deploy apa adanya (Vercel).

- `index.html`, `styles.css`, `app.js`, `id3.js`
- Font VT323 dan Silkscreen dari Google Fonts (SIL Open Font License), di-cache service worker
- `config.js`: Google OAuth Client ID
- `drive.js`: login Google (Google Identity Services) + Google Drive API
- `sw.js`: cache tampilan untuk offline

## Catatan iOS

Audio tetap jalan saat layar dikunci kalau dibuka lewat Safari. Untuk web app yang dibuka dari ikon Home Screen, iOS kadang menghentikan audio saat dikunci; itu batasan WebKit.

## Mengaktifkan login Google

1. Google Cloud Console → buat project → APIs & Services → aktifkan **Google Drive API**.
2. OAuth consent screen (Google Auth Platform): tipe External, isi nama app & email, tambahkan scope `drive.file`, lalu **Publish app**.
3. Credentials → Create credentials → OAuth client ID → **Web application**. Authorized JavaScript origins: `https://saku-player.vercel.app`.
4. Salin Client ID ke `config.js` (`googleClientId`).
