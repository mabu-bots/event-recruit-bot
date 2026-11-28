#!/usr/bin/env bash
# event-recruit-bot の一括ビルドスクリプト。
# 依存パッケージの取得から、型チェック込みのビルド、テスト実行までを
# 1コマンドで行う。途中で失敗したら、その時点で終了する。
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 依存パッケージを取得します"
npm install

echo "==> ビルドとテストを実行します"
npm test

echo "完了しました。起動するには .env を用意して npm start を実行してください"
