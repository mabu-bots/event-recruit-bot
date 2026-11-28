# Contributing

このリポジトリは、運用者の全リポジトリで共通の開発手順（aegis-bot で
確立した方式）に従います。

## 開発の流れ

1. **まず Issue を立てる。** すべての変更は Issue から始めます
   （Issue テンプレートを使用）。目的・作業内容・完了条件を書きます。
2. **main からブランチを切る。** 名前は `<type>/<Issue番号>-<slug>`、
   例: `feat/12-reminder`, `fix/9-state-trim`, `docs/3-readme`。
3. **実装とテスト。** ローカルでビルドとテストを実行し、両方通ることを
   確認します（`./build.sh`）。
4. **Pull Request を出す。** PR テンプレートに沿って書き、本文に
   `Closes #<番号>` を入れて Issue と紐付けます。
5. **Rebase and merge で取り込む。** CI が通ったら「Rebase and merge」で
   main へ入れ、ブランチを削除します。

## コミットメッセージ

Conventional Commits ＋ 英語の件名で書きます。

```
feat: add deadline reminder
fix: keep corrupt state file aside instead of overwriting it
docs: document environment variables
```

使う type: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`。

## リリース

main から切ります。バージョンを上げ、タグ `vX.Y.Z` を打ち、GitHub
Release をノートのみで公開します（バイナリは添付しません）。

## 注意

- 秘密情報はコミットしません。設定は `.env`（`.env.example` 参照）に
  置き、`.env` は git 管理外です。
