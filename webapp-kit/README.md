# webapp-kit

Web アプリ共通で使う「アプリにする（インストール）」「共有」と、スマホ表示の不具合対策をまとめたもの。
依存ライブラリなし。このフォルダをそのまま別のアプリにコピーして使う。

## できること

| 機能 | 内容 |
|---|---|
| アプリにするボタン | Chrome / Edge / Android ではブラウザのインストール画面を開く。iPhone / iPad と Mac の Safari では「ホーム画面に追加」の手順を案内する。LINE などのアプリ内ブラウザでは「Safari で開いて」と案内する。**インストール済み（ホーム画面から起動中）やインストールできないブラウザでは自動で隠れる** |
| 共有ボタン | スマホの共有シート（`navigator.share`）を開く。使えない環境ではリンクをコピーして「コピーしました」と表示する |

## 導入手順

### 1. ファイルを読み込む

```html
<link rel="stylesheet" href="./webapp-kit/webapp-kit.css">
<script src="./webapp-kit/webapp-kit.js"></script>
```

### 2. ボタンを置く

```html
<button data-wak="install">アプリにする</button>
<button data-wak="share">共有</button>
<!-- 共有する文章を指定する場合 -->
<button data-wak="share" data-wak-text="このアプリおすすめ！">共有</button>
```

見た目は自由に付けてよい。`data-wak="install"` のボタンは不要なときに `hidden` 属性が付いて消える。

### 3. 必要なら JS から設定・呼び出し

```js
WebAppKit.init({ title: 'アプリ名', text: '共有するときの文章' });
WebAppKit.share({ text: `スコア ${score} 点！` });   // 動的な文章を共有
WebAppKit.onChange(({ canInstall, standalone }) => { /* 表示の切り替えなど */ });
WebAppKit.isStandalone();   // ホーム画面から起動しているか
```

色は CSS 変数（`--wak-bg`, `--wak-fg`, `--wak-accent` など）で上書きできる。

## 新しいアプリで毎回やることチェックリスト

### `<head>`

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#背景色">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="短いアプリ名">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
```

- **`apple-mobile-web-app-status-bar-style` に `black-translucent` を使わない**（下の「上部が隠れる問題」参照）。指定しないか `default` にする。
- `manifest.webmanifest` には `name` / `short_name` / `start_url` / `display: "standalone"` / 192px と 512px のアイコンを入れる（Chrome でインストールできる条件）。
- HTTPS で公開する（GitHub Pages なら OK）。`file://` で開いた場合はインストール機能は動かない。

### CSS

```css
html { background-color: #背景色; }          /* Safari 26 の上下バーの色はここから取られる */
body { background-color: #背景色; }
.app {
  padding-top: max(12px, env(safe-area-inset-top));
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
}
```

- 画面の上下左右の端に置く要素は `env(safe-area-inset-*)` 分の余白をとる。
- 全画面のオーバーレイやモーダルは、隠すときに `opacity: 0` ではなく **`display: none`** にする（見えなくても Safari がバーの色を決めるときに拾ってしまう）。
- `100vh` ではなく `100dvh` を使う。

## iPhone で画面の上部が隠れる問題（iOS 26 以降の Liquid Glass）

**症状**: ホーム画面に追加したアプリで、画面の一番上（ステータスバーの下あたり）がぼかしで覆われて見えにくい。iPhone 17 / 18 Pro などで目立つ。

**原因**: `apple-mobile-web-app-status-bar-style` を `black-translucent` にすると、ページがステータスバーの裏まで描かれる。iOS 26 以降はこの部分に Liquid Glass のぼかしが重なり、ステータスバーの下 35pt ほどまで広がる。`env(safe-area-inset-top)` はこのぼかしの分を含まないので、CSS の余白では避けきれない。

**対策**: `black-translucent` をやめる（指定しないか `default`）。ステータスバーが不透明になり、ページはその下から始まるのでぼかしがかからない。ステータスバーの色は `theme-color` から決まる。

**注意**: この設定はホーム画面に追加した時点で読み込まれるので、**すでに追加済みの人は一度削除して追加し直す**必要がある。

参考:
- [fix(pwa): Liquid Glass blur over header in iOS standalone (MrClit/fin-app #411)](https://github.com/MrClit/fin-app/issues/411)
- [Safari 26 Liquid Glass: toolbar tinting, white bars, viewport bugs](https://1ar.io/updates/safari-26-liquid-glass-web/)
