// 読み込み URL に中身のハッシュを付ける:  node tools/stamp.mjs
//
// GitHub Pages は Cache-Control: max-age=600 を付けて配信する。ファイル名が
// 同じままだと、更新してもブラウザが古い JS / CSS を握り続けて画面が変わらない。
// (とくに ES モジュールは、HTML を読み直しても import 先が古いままになりうる)
//
// そこで読み込み側の URL に ?v=<中身のハッシュ> を付ける。中身が変わったときだけ
// ハッシュが変わり、URL が変わり、ブラウザは必ず取り直す。変わっていなければ
// 何度実行しても差分は出ない。
//
// 直すのは 2 か所:
//   HTML の <script src> と <link href>
//   JS の import ... from './x.js'
//
// 中身を変えたら commit の前に走らせる。走らせ忘れは test/coord.test.mjs が見つける。

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ls = (dir, ext) => readdirSync(join(root, dir))
  .filter((f) => f.endsWith(ext))
  .sort()
  .map((f) => `${dir}/${f}`);

const read = (f) => readFileSync(join(root, f), 'utf8');
const strip = (text) => text.replace(/\?v=[0-9a-f]{8}/g, '');

/**
 * 版を打ち直す。
 * @param write true なら書き込む。false なら「ずれているファイル」を返すだけ。
 */
export function stampAll({ write = false } = {}) {
  const code = [...ls('src', '.js'), ...ls('css', '.css')];
  const pages = readdirSync(root).filter((f) => f.endsWith('.html')).sort();

  // ハッシュは ?v= を外した中身から取る。そうしないと書き込んだ結果でハッシュが
  // 変わってしまい、走らせるたびに値が動く。
  const hash = createHash('sha1');
  for (const f of code) hash.update(`${f}\n${strip(read(f))}`);
  const v = hash.digest('hex').slice(0, 8);

  const outdated = [];
  for (const f of [...pages, ...code]) {
    const before = read(f);
    const after = strip(before)
      // HTML: <script src="./src/coord.js"> と <link href="css/coord.css">
      .replace(/((?:src|href)=")((?:\.\/)?(?:src|css)\/[\w.-]+\.(?:js|css))(")/g, `$1$2?v=${v}$3`)
      // JS: import ... from './puzzle.js'
      .replace(/(from '\.\/[\w.-]+\.js)(')/g, `$1?v=${v}$2`);
    if (after === before) continue;
    outdated.push(f);
    if (write) writeFileSync(join(root, f), after);
  }
  return { version: v, outdated };
}

// 直接実行されたときだけ書き込む (テストから読み込んでも動かない)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version, outdated } = stampAll({ write: true });
  console.log(`版 ?v=${version}`);
  console.log(outdated.length ? `書き換え: ${outdated.join(', ')}` : '変更なし (すでに最新の版)');
}
