# event-recruit-bot 設計書

## 1. 位置づけ

Discord サーバーでのイベント参加募集（投稿・RSVP・締切リマインド・
開始通知とスレッド作成）を担う Bot。まぶさばのイベント運営用。
本リポジトリは 2026-11-28 に統一開発フローへ合わせて再構築したもので、
本番（台3 minase）で稼働していた実装の振る舞いをすべて引き継ぎ、
バージョンを v1.0.0 にリセットした。引き継ぐ対象は本番サーバーの
スナップショットを正として棚卸しした。

## 2. アーキテクチャ

```
Discord スラッシュコマンド / ボタン
  │  interactionCreate
  ▼
index.ts ──► commands.ts（定義・ハンドラ）──► embeds.ts（Embed・ボタン）
  │              │
  │              └────► store.ts（状態ストア: data/state.json）
  ├─► scheduler.ts（1分間隔: リマインド / 開始通知＋スレッド）
  ├─► presence-cycle.ts（プレゼンスの1分サイクル）
  ├─► watchdog.ts（READY ウォッチドッグ）
  └─► execution-log.ts（コマンド実行ログ）
ドメインの純粋関数: events.ts（RSVP 遷移・要否判定）/ time.ts（JST 解釈）
```

モジュール構成:

| モジュール | 役割 |
|---|---|
| `src/config.ts` | 環境変数の読み込み（DISCORD_TOKEN / CLIENT_ID / GUILD_ID / STATE_PATH） |
| `src/time.ts` | JST 日時文字列のパースと表示整形（純粋関数） |
| `src/events.ts` | イベント記録の型、RSVP 状態遷移、自動処理の要否判定（純粋関数） |
| `src/store.ts` | 状態ストア。JSON ファイルへ原子的（tmp + rename）に保存 |
| `src/embeds.ts` | 募集 Embed と RSVP ボタンの組み立て |
| `src/commands.ts` | /event の定義とハンドラ、ボタン処理、一覧表示の組み立て |
| `src/scheduler.ts` | 1分間隔の確認。締切1時間前リマインドと開始通知・スレッド作成 |
| `src/presence-cycle.ts` | プレゼンス・サイクル（全 Bot 共通） |
| `src/watchdog.ts` | READY ウォッチドッグ（サイレント停滞の検知） |
| `src/execution-log.ts` | コマンド実行ログ（全 Bot 共通書式） |
| `src/deploy.ts` | コマンドの事前登録（任意） |
| `src/index.ts` | エントリポイント。ログイン、登録、対話処理、起動失敗ハンドリング |

## 3. 状態スキーマ

状態は `data/state.json`（`STATE_PATH` で変更可）に以下の形で保存する。

```json
{ "events": [ EventRecord, ... ] }
```

EventRecord のフィールド:

| フィールド | 型 | 内容 |
|---|---|---|
| `id` | string | 6文字の短い ID（紛らわしい文字を除いた英数字） |
| `guildId` | string | 募集先サーバー |
| `channelId` | string | 募集投稿のチャンネル |
| `messageId` | string \| null | 募集投稿のメッセージ ID |
| `creatorId` | string | 作成者のユーザー ID |
| `title` | string | イベント名 |
| `description` | string | 説明文（空文字あり） |
| `startAt` | number | 開始時刻（epoch ミリ秒） |
| `deadlineAt` | number | 締切（epoch ミリ秒） |
| `status` | string | `open` / `closed` / `cancelled` / `started` |
| `rsvps` | object | ユーザー ID → 区分（`join` / `maybe` / `decline`） |
| `reminded` | boolean | リマインド送信済みフラグ |
| `startedNotified` | boolean | 開始通知送信済みフラグ |
| `threadId` | string \| null | 開始時に作ったスレッド ID |
| `createdAt` | number | 作成時刻（epoch ミリ秒） |

## 4. 判断記録

1. **状態は JSON ファイルに保存する（DB を使わない）。** イベント件数は
   小規模で、単一プロセス運用のため、ファイル保存で十分。書き込みは
   一時ファイル + rename の原子的方式にし、破損時は元ファイルを
   `.corrupt-<時刻>` へ退避してから空で起動する（無言で上書きしない）。
   終了したイベントは最大200件まで保持し、古い順に間引く。
2. **特権インテントは使わない。** Guilds のみで全機能が成立するため、
   開発者ポータルでの審査対象を増やさない。
3. **日時は JST 固定で解釈する。** 利用者が日本国内のコミュニティであり、
   夏時間のない JST はオフセット引き算で厳密に扱える。存在しない日付は
   往復変換で検出して弾く。
4. **メンションは既定で全て無効化し、許可箇所だけ明示する。** クライアント
   既定の allowedMentions を `{ parse: [] }` とし、開始通知・スレッドでの
   参加者メンションだけを users 指定で許可する。タイトル等のユーザー入力が
   メンションとして発火しないようにするため。
5. **API を伴うハンドラは冒頭で defer する。** create / close / cancel は
   募集投稿の送信・更新を伴い、初回応答の3秒制限を超えうるため。
6. **プレゼンスは全 Bot 共通のサイクルに統一した（2026-11-27）。**
   Playing で1分交代に「起動して <経過>」と「現在時刻 HH:MM JST」を表示。
   値は次の分の境界時点のものを計算し、境界の 200ms 前に先行送信する
   （伝播遅延の実測中央値 190ms と相殺）。位相は Unix 分の偶奇で決まる。
   従来の Watching「/help | {ping}ms」（5分更新）は置き換えた。
7. **READY ウォッチドッグを置く。** ログイン後に READY が来ないサイレント
   停滞は discord.js の自動再接続が効かない場合があるため、READY でない
   状態が120秒続いたらプロセスを終了し、pm2 の再起動に委ねる。
8. **コマンド実行ログを標準出力へ1行残す（全 Bot 共通書式）。**
   時刻（ISO）・コマンド名・経路・guild/channel/user ID・成否のみで、
   入力テキストは記録しない。RSVP ボタンとスケジューラ通知は対象外。
9. **起動失敗の扱い。** コマンド登録の失敗はログを残してログインを続行し、
   ログイン失敗は原因をログに残して異常終了する。Client の Error /
   ShardError と unhandledRejection の受け皿も置く（2026-11-22 監査の
   指摘に基づく堅牢化として本番に導入済みの振る舞い）。
10. **開発手順を統一した（2026-11-28）。** Issue → ブランチ → PR →
    Rebase and merge の統一フロー（CONTRIBUTING.md）を採用し、あわせて
    リポジトリをゼロから再構築した。バージョンは v1.0.0 にリセット。
    本番との意図的な差異はこのリセットと、プレゼンス・サイクルの
    単体テスト追加のみで、機能・文言・定義の差異はない。
