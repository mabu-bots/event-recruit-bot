// ==========================================
// 🧪 テスト: 時刻ユーティリティ
// ==========================================
import assert from "node:assert/strict";
import test from "node:test";
import { discordTimestamp, formatJst, parseDateTimeJst } from "../src/time.js";

test("parseDateTimeJst: 入力を JST として解釈する", () => {
  // 2026-11-23 19:00 JST は 2026-11-23 10:00 UTC
  assert.equal(parseDateTimeJst("2026-11-23 19:00"), Date.UTC(2026, 10, 23, 10, 0, 0));
});

test("parseDateTimeJst: 区切り文字と秒のバリエーションを受け付ける", () => {
  const base = Date.UTC(2026, 10, 23, 10, 0, 0);
  assert.equal(parseDateTimeJst("2026/11/23 19:00"), base);
  assert.equal(parseDateTimeJst("2026-11-23 19:00:30"), base + 30_000);
  assert.equal(parseDateTimeJst(" 2026-11-23 19:00 "), base);
});

test("parseDateTimeJst: 解釈できない入力は null を返す", () => {
  assert.equal(parseDateTimeJst(""), null);
  assert.equal(parseDateTimeJst("abc"), null);
  assert.equal(parseDateTimeJst("2026-11-23"), null); // 時刻がない
  assert.equal(parseDateTimeJst("2026-13-01 10:00"), null); // 13月
  assert.equal(parseDateTimeJst("2026-02-30 10:00"), null); // 存在しない日
  assert.equal(parseDateTimeJst("2026-11-23 25:00"), null); // 25時
  assert.equal(parseDateTimeJst("2026-11-23 19:60"), null); // 60分
});

test("formatJst: 曜日つきの JST 表記に整形する", () => {
  // 2026-11-23 は月曜日
  assert.equal(formatJst(Date.UTC(2026, 10, 23, 10, 0, 0)), "2026/11/23(月) 19:00");
  assert.equal(formatJst(Date.UTC(2026, 0, 1, 0, 0, 0)), "2026/01/01(木) 09:00");
});

test("discordTimestamp: 秒単位の記法に変換する", () => {
  assert.equal(discordTimestamp(Date.UTC(2026, 10, 23, 10, 0, 0), "F"), "<t:1795428000:F>");
  assert.equal(discordTimestamp(Date.UTC(2026, 10, 23, 10, 0, 0), "R"), "<t:1795428000:R>");
  assert.equal(discordTimestamp(Date.UTC(2026, 10, 23, 10, 0, 0)), "<t:1795428000:F>");
});
