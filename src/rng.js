// 決定論的な擬似乱数。同じシードなら必ず同じ迷路になる。
export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 最初の数個は種の値を引きずり、近い種どうしで似た値になる。
  // (種だけ変えて 1 個目を使うと、どの種でも 0.6 台、といったことが起きる)
  // 捨ててから渡す。
  for (let i = 0; i < 8; i++) next();
  return next;
}

// 任意の文字列を 32bit のシード値に潰す (FNV-1a)。
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeedString() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
