// ==========================================
// 🧪 テスト: RSVP 状態遷移と自動処理の要否
// ==========================================
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRsvp,
  canManage,
  dueActions,
  generateEventId,
  rsvpGroups,
  type EventRecord,
} from "../src/events.js";

test("applyRsvp: 未回答のユーザーに区分を設定する", () => {
  assert.deepEqual(applyRsvp({}, "u1", "join"), { u1: "join" });
});

test("applyRsvp: 別の区分を押したら移動する", () => {
  assert.deepEqual(applyRsvp({ u1: "join" }, "u1", "maybe"), { u1: "maybe" });
});

test("applyRsvp: 同じ区分をもう一度押したら取り消す", () => {
  assert.deepEqual(applyRsvp({ u1: "join", u2: "join" }, "u1", "join"), { u2: "join" });
});

test("applyRsvp: 引数の Record は変更しない", () => {
  const before: Record<string, "join"> = { u1: "join" };
  applyRsvp(before, "u1", "decline");
  assert.deepEqual(before, { u1: "join" });
});

test("rsvpGroups: 区分ごとにユーザー ID を振り分ける", () => {
  const groups = rsvpGroups({ a: "join", b: "maybe", c: "join", d: "decline" });
  assert.deepEqual([...groups.join].sort(), ["a", "c"]);
  assert.deepEqual(groups.maybe, ["b"]);
  assert.deepEqual(groups.decline, ["d"]);
});

test("generateEventId: 既存と重ならない6文字の ID を返す", () => {
  const existing = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const id = generateEventId(existing);
    assert.equal(id.length, 6);
    assert.ok(!existing.has(id));
    existing.add(id);
  }
});

// テスト用のイベント記録を組み立てる
function makeEvent(partial: Partial<EventRecord>): EventRecord {
  return {
    id: "abc123",
    guildId: "g1",
    channelId: "c1",
    messageId: "m1",
    creatorId: "owner",
    title: "テスト",
    description: "",
    startAt: 1_000_000_000_000,
    deadlineAt: 1_000_000_000_000,
    status: "open",
    rsvps: {},
    reminded: false,
    startedNotified: false,
    threadId: null,
    createdAt: 0,
    ...partial,
  };
}

const HOUR = 60 * 60 * 1000;

test("dueActions: 締切まで1時間を切ると remind が出る", () => {
  const e = makeEvent({ deadlineAt: 10 * HOUR, startAt: 12 * HOUR });
  assert.deepEqual(dueActions(e, 8 * HOUR), []); // 2時間前はまだ
  assert.deepEqual(dueActions(e, 9 * HOUR), ["remind"]); // ちょうど1時間前
  assert.deepEqual(dueActions(e, 9.5 * HOUR), ["remind"]);
});

test("dueActions: リマインド済みなら remind は出ない", () => {
  const e = makeEvent({ deadlineAt: 10 * HOUR, startAt: 12 * HOUR, reminded: true });
  assert.deepEqual(dueActions(e, 9.5 * HOUR), []);
});

test("dueActions: 開始時刻を過ぎたら start が出る（締切済みでも）", () => {
  const e = makeEvent({ deadlineAt: 10 * HOUR, startAt: 12 * HOUR, reminded: true });
  assert.deepEqual(dueActions(e, 12 * HOUR), ["start"]);
  const closed = makeEvent({
    status: "closed",
    deadlineAt: 10 * HOUR,
    startAt: 12 * HOUR,
    reminded: true,
  });
  assert.deepEqual(dueActions(closed, 12 * HOUR), ["start"]);
});

test("dueActions: 開始通知済み・中止・開始済みでは何も出ない", () => {
  const base = { deadlineAt: 10 * HOUR, startAt: 12 * HOUR };
  assert.deepEqual(
    dueActions(makeEvent({ ...base, startedNotified: true, reminded: true }), 13 * HOUR),
    [],
  );
  assert.deepEqual(dueActions(makeEvent({ ...base, status: "cancelled" }), 13 * HOUR), []);
  assert.deepEqual(
    dueActions(makeEvent({ ...base, status: "started", startedNotified: true }), 13 * HOUR),
    [],
  );
});

test("dueActions: 停止中に締切と開始の両方を過ぎていたら両方出る", () => {
  const e = makeEvent({ deadlineAt: 10 * HOUR, startAt: 12 * HOUR });
  assert.deepEqual(dueActions(e, 13 * HOUR), ["remind", "start"]);
});

test("canManage: 作成者本人か ManageGuild のどちらかで許可する", () => {
  const e = makeEvent({});
  assert.equal(canManage(e, "owner", false), true);
  assert.equal(canManage(e, "other", true), true);
  assert.equal(canManage(e, "other", false), false);
});
