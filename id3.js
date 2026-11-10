// Pembaca tag ID3v2 ringan: judul, artis, album, dan gambar sampul.
(function () {
  function syncsafe(b, o) {
    return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
  }
  function u32(b, o) {
    return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  }
  function decodeText(bytes, enc) {
    try {
      let label = "latin1";
      if (enc === 1) label = "utf-16";
      else if (enc === 2) label = "utf-16be";
      else if (enc === 3) label = "utf-8";
      return new TextDecoder(label).decode(bytes).replace(/\u0000+$/g, "").replace(/\u0000/g, " / ").trim();
    } catch (e) {
      return "";
    }
  }
  function findTerminator(b, start, enc) {
    if (enc === 1 || enc === 2) {
      for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
      return b.length;
    }
    for (let i = start; i < b.length; i++) if (b[i] === 0) return i;
    return b.length;
  }

  async function readTags(blob) {
    const out = { title: "", artist: "", album: "", cover: null };
    try {
      const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
      if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return out; // "ID3"
      const ver = head[3];
      const flags = head[5];
      const size = syncsafe(head, 6);
      const max = Math.min(size, 12 * 1024 * 1024);
      const b = new Uint8Array(await blob.slice(10, 10 + max).arrayBuffer());
      let p = 0;
      if (flags & 0x40) {
        p = ver === 4 ? syncsafe(b, 0) : u32(b, 0) + 4;
      }
      const v22 = ver === 2;
      const idLen = v22 ? 3 : 4;
      const hdrLen = v22 ? 6 : 10;
      while (p + hdrLen <= b.length) {
        const id = String.fromCharCode(...b.subarray(p, p + idLen));
        if (!/^[A-Z0-9]+$/.test(id)) break;
        let fsize;
        if (v22) fsize = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5];
        else if (ver === 4) fsize = syncsafe(b, p + 4);
        else fsize = u32(b, p + 4);
        const start = p + hdrLen;
        const end = start + fsize;
        if (fsize <= 0 || end > b.length) break;
        const data = b.subarray(start, end);
        const enc = data[0];
        if (id === "TIT2" || id === "TT2") out.title = decodeText(data.subarray(1), enc);
        else if (id === "TPE1" || id === "TP1") out.artist = decodeText(data.subarray(1), enc);
        else if (id === "TALB" || id === "TAL") out.album = decodeText(data.subarray(1), enc);
        else if ((id === "APIC" || id === "PIC") && !out.cover) {
          let q = 1;
          let mime = "image/jpeg";
          if (v22) {
            const fmt = String.fromCharCode(...data.subarray(1, 4)).toUpperCase();
            mime = fmt === "PNG" ? "image/png" : "image/jpeg";
            q = 4;
          } else {
            const mEnd = findTerminator(data, 1, 0);
            mime = new TextDecoder("latin1").decode(data.subarray(1, mEnd)) || "image/jpeg";
            if (!mime.includes("/")) mime = "image/" + mime.toLowerCase();
            q = mEnd + 1;
          }
          q += 1; // jenis gambar
          const dEnd = findTerminator(data, q, enc);
          q = dEnd + (enc === 1 || enc === 2 ? 2 : 1);
          if (q < data.length) out.cover = new Blob([data.slice(q)], { type: mime });
        }
        p = end;
      }
    } catch (e) {
      /* abaikan tag rusak */
    }
    return out;
  }

  window.readID3 = readTags;
})();
