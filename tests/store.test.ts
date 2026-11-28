// ==========================================
// 🧪 テスト: 状態ストア
// ==========================================
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { EventRecord } from "../src/events.js";
import { Store } from "../src/store.js";

// テスト用のイベント記録（状態スキーマの全フィールドを持つ）
function makeEvent(id: string): EventRecord {
  return {
    id,
    guildId: "g1",
    channelId: "c1",
    messageId: null,
    creatorId: "owner",
    title: "テストイベント",
    description: "",
    startAt: 1_000_000_000_000,
    deadlineAt: 1_000_000_000_000,
    status: "open",
    rsvps: {},
    reminded: false,
    startedNotified: false,
    threadId: null,
    createdAt: 0,
  };
}

// 一時ディレクトリにストアを作って使い終わったら消す
function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "event-recruit-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Store: 追加したイベントは再読み込みしても保持される", () => {
  withTempDir((dir) => {
    const path = join(dir, "state.json");
    const store = new Store(path);
    store.addEvent(makeEvent("abc123"));
    const reopened = new Store(path);
    assert.equal(reopened.allEvents().length, 1);
    assert.equal(reopened.findEvent("abc123")?.title, "テストイベント");
    assert.equal(reopened.eventsForGuild("g1").length, 1);
    assert.equal(reopened.eventsForGuild("other").length, 0);
  });
});

test("Store: updateEvent の変更が保存される", () => {
  withTempDir((dir) => {
    const path = join(dir, "state.json");
    const store = new Store(path);
    const event = makeEvent("abc123");
    store.addEvent(event);
    event.status = "closed";
    event.rsvps = { u1: "join" };
    store.updateEvent(event);
    const reopened = new Store(path);
    assert.equal(reopened.findEvent("abc123")?.status, "closed");
    assert.deepEqual(reopened.findEvent("abc123")?.rsvps, { u1: "join" });
  });
});

test("Store: 保存されるイベント記録のフィールド構成がスキーマ通り", () => {
  withTempDir((dir) => {
    const path = join(dir, "state.json");
    const store = new Store(path);
    store.addEvent(makeEvent("abc123"));
    const saved = JSON.parse(readFileSync(path, "utf-8")) as { events: EventRecord[] };
    assert.deepEqual(Object.keys(saved), ["events"]);
    assert.deepEqual(Object.keys(saved.events[0]!).sort(), [
      "channelId",
      "createdAt",
      "creatorId",
      "deadlineAt",
      "description",
      "guildId",
      "id",
      "messageId",
      "reminded",
      "rsvps",
      "startAt",
      "startedNotified",
      "status",
      "threadId",
      "title",
    ]);
  });
});

test("Store: 壊れたファイルでは空の状態で起動する", () => {
  withTempDir((dir) => {
    const path = join(dir, "state.json");
    writeFileSync(path, "{broken json", "utf-8");
    const store = new Store(path);
    assert.deepEqual(store.allEvents(), []);
  });
});

test("Store: 壊れたファイルは退避され、元の内容が残る", () => {
  withTempDir((dir) => {
    const path = join(dir, "state.json");
    writeFileSync(path, "{broken json", "utf-8");
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    let store: Store;
    try {
      store = new Store(path);
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(store.allEvents(), []);
    // エラーログが出ていること
    assert.ok(errors.length > 0);
    // 退避ファイルに元の内容がそのまま残っていること
    const backups = readdirSync(dir).filter((f) => f.startsWith("state.json.corrupt-"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(dir, backups[0]!), "utf-8"), "{broken json");
    // 退避後に保存しても退避ファイルは消えないこと
    store.addEvent(makeEvent("xyz789"));
    assert.equal(readFileSync(join(dir, backups[0]!), "utf-8"), "{broken json");
    assert.equal(new Store(path).allEvents().length, 1);
  });
});
