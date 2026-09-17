#!/bin/sh
# ES モジュールを使うので file:// では動きません。ローカルサーバー経由で開いてください。
# もう一方の迷路へのリンクを辿りたい場合は、親フォルダの serve.sh を使ってください。
PORT="${1:-8000}"
echo "http://localhost:$PORT/ を開いてください (Ctrl+C で停止)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
