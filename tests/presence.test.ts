// ==========================================
// 🧪 テスト: プレゼンス・サイクル
// ==========================================
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatElapsedMinutes,
  nextPresenceSend,
  presenceCycleText,
} from "../src/presence-cycle.js";

test("formatElapsedMinutes: 時間と分に分けて整形する", () => {
  assert.equal(formatElapsedMinutes(0), "0分");
  assert.equal(formatElapsedMinutes(26 * 60_000), "26分");
  assert.equal(formatElapsedMinutes(86 * 60_000), "1時間26分");
  assert.equal(formatElapsedMinutes(120 * 60_000), "2時間00分");
  assert.equal(formatElapsedMinutes(-5_000), "0分"); // 負値は0に丸める
});

test("presenceCycleText: Unix 分が偶数のときは経過時間を表示する", () => {
  // 2026-11-27 10:00 UTC は Unix 分で偶数（phase 0）
  const at = new Date(Date.UTC(2026, 10, 27, 10, 0, 0));
  assert.equal(Math.floor(at.getTime() / 60_000) % 2, 0);
  const startedAt = at.getTime() - 86 * 60_000;
  assert.equal(presenceCycleText("Bot", startedAt, at), "Bot | 起動して 1時間26分");
});

test("presenceCycleText: Unix 分が奇数のときは現在時刻 (JST) を表示する", () => {
  // 2026-11-27 10:01 UTC は Unix 分で奇数（phase 1）。JST では 19:01
  const at = new Date(Date.UTC(2026, 10, 27, 10, 1, 0));
  assert.equal(Math.floor(at.getTime() / 60_000) % 2, 1);
  assert.equal(presenceCycleText("Bot", at.getTime(), at), "Bot | 現在時刻 19:01 JST");
});

test("nextPresenceSend: 次の分の境界の 200ms 前を返す", () => {
  const now = Date.UTC(2026, 10, 27, 10, 0, 30, 0); // 分の途中
  const { sendAt, boundary } = nextPresenceSend(now);
  assert.equal(boundary, Date.UTC(2026, 10, 27, 10, 1, 0, 0));
  assert.equal(sendAt, boundary - 200);
});

test("nextPresenceSend: 送信予定時刻を過ぎていたら翌分へ進める", () => {
  // 境界まで 100ms しかない時点では、今の境界向けの送信はもう過ぎている
  const now = Date.UTC(2026, 10, 27, 10, 0, 59, 900);
  const { sendAt, boundary } = nextPresenceSend(now);
  assert.equal(boundary, Date.UTC(2026, 10, 27, 10, 2, 0, 0));
  assert.equal(sendAt, boundary - 200);
  assert.ok(sendAt > now);
});
