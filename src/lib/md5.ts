/**
 * MD5 sincrono (RFC 1321) su testo UTF-8, esadecimale minuscolo come md5() di PostgreSQL.
 * Serve solo come impronta delle righe importate (hash_riga): non è un uso di sicurezza.
 * crypto.subtle non offre MD5 ed è asincrono, mentre i preparatori dei fogli sono sincroni.
 */
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
const enc = new TextEncoder();

export function md5(testo: string): string {
  const dati = enc.encode(testo);
  const n = dati.length;
  const blocchi = ((n + 8) >>> 6) + 1;
  const w = new Uint32Array(blocchi * 16);
  for (let i = 0; i < n; i++) w[i >> 2] |= dati[i] << ((i % 4) * 8);
  w[n >> 2] |= 0x80 << ((n % 4) * 8);
  w[blocchi * 16 - 2] = (n * 8) >>> 0;
  w[blocchi * 16 - 1] = Math.floor(n / 0x20000000);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let b = 0; b < blocchi; b++) {
    let a = a0, bb = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      const r = i >> 4;
      if (r === 0) { f = (bb & c) | (~bb & d); g = i; }
      else if (r === 1) { f = (d & bb) | (~d & c); g = (5 * i + 1) % 16; }
      else if (r === 2) { f = bb ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (bb | ~d); g = (7 * i) % 16; }
      const t = d;
      d = c;
      c = bb;
      const x = (a + f + K[i] + w[b * 16 + g]) >>> 0;
      const s = S[r * 4 + (i % 4)];
      bb = (bb + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = t;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + bb) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  let out = "";
  for (const v of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out += ((v >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  return out;
}
