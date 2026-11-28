// ==========================================
// 🧪 テスト: コマンド定義 JSON の固定（本番定義との機械比較）
// ==========================================
// 📝 登録されるコマンド定義は本番の定義と完全一致が前提のため、
// 期待する JSON をここに固定し、生成結果と機械的に突き合わせる。
// 定義を変更するときは、このテストの期待値も一緒に更新すること。
import assert from "node:assert/strict";
import test from "node:test";
import { commandData } from "../src/commands.js";

// ApplicationCommandOptionType: SUB_COMMAND = 1, STRING = 3
// 先頭の type: 1 は CHAT_INPUT コマンドであることを示す
const EXPECTED_COMMAND_DATA = [
  {
    type: 1,
    name: "event",
    description: "イベントの参加募集を管理します",
    options: [
      {
        type: 1,
        name: "create",
        description: "イベントの募集を投稿します",
        options: [
          {
            type: 3,
            name: "title",
            description: "イベント名",
            required: true,
            max_length: 100,
          },
          {
            type: 3,
            name: "datetime",
            description: "開始日時 (例: 2026-11-23 19:00、日本時間)",
            required: true,
          },
          {
            type: 3,
            name: "description",
            description: "説明 (任意)",
            required: false,
            max_length: 1000,
          },
          {
            type: 3,
            name: "deadline",
            description: "締切日時 (例: 2026-11-23 18:00、省略時は開始時刻)",
            required: false,
          },
        ],
      },
      {
        type: 1,
        name: "list",
        description: "募集中のイベント一覧を表示します",
        options: [],
      },
      {
        type: 1,
        name: "close",
        description: "募集を締め切ります (作成者またはサーバー管理権限)",
        options: [
          {
            type: 3,
            name: "id",
            description: "イベントID (募集投稿の下部に表示)",
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "cancel",
        description: "イベントを中止します (作成者またはサーバー管理権限)",
        options: [
          {
            type: 3,
            name: "id",
            description: "イベントID (募集投稿の下部に表示)",
            required: true,
          },
        ],
      },
    ],
  },
];

test("commandData: 本番のコマンド定義 JSON と一致する", () => {
  assert.deepEqual(stripUndefined(commandData), EXPECTED_COMMAND_DATA);
});

// undefined の項目（builder が未設定として出す枠）を取り除いてから比較する
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (inner !== undefined) result[key] = stripUndefined(inner);
    }
    return result;
  }
  return value;
}
