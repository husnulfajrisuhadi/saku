# Putar

Pemutar musik web, mobile-first, untuk file lagu milik sendiri.

- Impor MP3/M4A/AAC/WAV/FLAC dari iPhone, tersimpan offline di browser (IndexedDB).
- Kontrol di lock screen & Control Center (Media Session API): play/pause, next, previous, scrub.
- Acak, ulangi semua / ulangi satu, maju-mundur 10 detik, cari, urut terbaru / A–Z.
- Baca judul, artis, album, dan sampul dari tag ID3.
- Opsional: login (akun Supabase yang sama dengan Lajur) untuk menyimpan lagu ke cloud dan mengunduhnya lagi di perangkat lain.

## Teknis

Static site tanpa build step. Deploy apa adanya (Vercel).

- `index.html`, `styles.css`, `app.js`, `id3.js`
- `config.js`: URL dan publishable key Supabase
- `sw.js`: cache tampilan untuk offline
- Supabase: tabel `public.putar_tracks` + bucket privat `putar` (RLS per user, file di folder `<user_id>/`)

## Catatan iOS

Audio tetap jalan saat layar dikunci kalau dibuka lewat Safari. Untuk web app yang dibuka dari ikon Home Screen, iOS kadang menghentikan audio saat dikunci; itu batasan WebKit.
