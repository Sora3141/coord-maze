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
// 直すのは 3 か所:
//   HTML の <script src> と <link href> (src/ css/ webapp-kit/)
//   JS の import ... from './x.js'
//   アイコンとマニフェスト (HTML の <link rel="icon" など と、manifest.webmanifest の中)
// あわせて sw.js の VERSION と SHELL (圏外用に先に保存するファイルの一覧) も書く。
//
// アイコンの版は JS / CSS とは別に、アイコンとマニフェストの中身だけから取る。
// CSS を直しただけでアイコンまで取り直させないため。
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
const MANIFEST = 'manifest.webmanifest';
const SW = 'sw.js';
const SW_BLOCK = /(\/\/ --- ここから下の 2 つは[^\n]*\n)[\s\S]*?(\/\/ --- ここまで ---)/;
const strip = (text) => text.replace(/\?v=[0-9a-f]{8}/g, '');

/**
 * 版を打ち直す。
 * @param write true なら書き込む。false なら「ずれているファイル」を返すだけ。
 */
export function stampAll({ write = false } = {}) {
  const own = [...ls('src', '.js'), ...ls('css', '.css')];
  // webapp-kit/ は正本 (sora3141.github.io) からのコピー。版の計算と SHELL には入れるが、
  // 中身は書き換えない (コメント中の使い方の例まで書き換えてしまうため)
  const kit = [...ls('webapp-kit', '.js'), ...ls('webapp-kit', '.css')];
  const code = [...own, ...kit];
  const pages = readdirSync(root).filter((f) => f.endsWith('.html')).sort();

  // ハッシュは ?v= を外した中身から取る。そうしないと書き込んだ結果でハッシュが
  // 変わってしまい、走らせるたびに値が動く。
  const hash = createHash('sha1');
  for (const f of code) hash.update(`${f}\n${strip(read(f))}`);
  const v = hash.digest('hex').slice(0, 8);

  // アイコン (PNG は中身をそのまま) とマニフェスト。og.png は共有カード用で、
  // ページからは読まない (圏外用に保存する必要もない) ので外す
  const icons = ls('icons', '.svg').concat(ls('icons', '.png'))
    .filter((f) => f !== 'icons/og.png').sort();
  const ihash = createHash('sha1');
  for (const f of icons) ihash.update(f).update(readFileSync(join(root, f)));
  ihash.update(strip(read(MANIFEST)));
  const iv = ihash.digest('hex').slice(0, 8);

  const outdated = [];
  for (const f of [...pages, ...own, MANIFEST]) {
    const before = read(f);
    const after = strip(before)
      // HTML: <script src="./src/coord.js"> と <link href="css/coord.css"> と webapp-kit/
      .replace(/((?:src|href)=")((?:\.\/)?(?:src|css|webapp-kit)\/[\w.-]+\.(?:js|css))(")/g, `$1$2?v=${v}$3`)
      // JS: import ... from './puzzle.js'
      .replace(/(from '\.\/[\w.-]+\.js)(')/g, `$1?v=${v}$2`)
      // HTML: <link rel="icon" href="icons/icon.svg"> など / manifest: "src": "icons/icon-192.png"
      .replace(/((?:href=|"src": ?)")((?:\.\/)?(?:icons\/[\w.-]+\.(?:svg|png)|manifest\.webmanifest))(")/g, `$1$2?v=${iv}$3`);
    if (after === before) continue;
    outdated.push(f);
    if (write) writeFileSync(join(root, f), after);
  }
  // sw.js: 版が変わったら新しいキャッシュに入れ直す。HTML の中身も版に含める
  // (HTML だけ直したときも、圏外用の保存版を入れ替えるため)。
  // SHELL は版なしの URL。圏外のときは sw.js が ?v= を無視して探す。
  const shell = ['./', ...pages, ...code, MANIFEST, ...icons].map((f) => (f === './' ? f : `./${f}`));
  const swhash = createHash('sha1').update(`${v}\n${iv}\n`);
  for (const f of pages) swhash.update(`${f}\n${strip(read(f))}`);
  const swv = swhash.digest('hex').slice(0, 8);
  const swBefore = read(SW);
  if (!SW_BLOCK.test(swBefore)) throw new Error(`${SW} に stamp.mjs が書く場所の印がありません`);
  const swAfter = swBefore.replace(SW_BLOCK, (_, head, tail) =>
    `${head}const VERSION = '${swv}';\nconst SHELL = [\n${shell.map((u) => `  '${u}',`).join('\n')}\n];\n${tail}`);
  if (swAfter !== swBefore) {
    outdated.push(SW);
    if (write) writeFileSync(join(root, SW), swAfter);
  }

  return { version: v, iconVersion: iv, swVersion: swv, outdated };
}

// 直接実行されたときだけ書き込む (テストから読み込んでも動かない)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version, iconVersion, swVersion, outdated } = stampAll({ write: true });
  console.log(`版 ?v=${version} (アイコン ?v=${iconVersion}, sw.js ${swVersion})`);
  console.log(outdated.length ? `書き換え: ${outdated.join(', ')}` : '変更なし (すでに最新の版)');
}
