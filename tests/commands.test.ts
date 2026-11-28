// ==========================================
// 🧪 テスト: コマンド表示・defer・メンション制御
// ==========================================
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildListContent, handleCommand } from "../src/commands.js";
import type { EventRecord } from "../src/events.js";
import { Scheduler } from "../src/scheduler.js";
import { Store } from "../src/store.js";

function makeEvent(id: string, partial: Partial<EventRecord> = {}): EventRecord {
  return {
    id,
    guildId: "g1",
    channelId: "c1",
    messageId: "m1",
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
    ...partial,
  };
}

// クロージャ内で代入される捕捉変数を、null でないことを確認して取り出す
function must(value: Record<string, unknown> | null): Record<string, unknown> {
  if (value === null) throw new Error("捕捉されるはずの値がありません");
  return value;
}

// 一時ディレクトリ上のストアでテスト本体を実行する
function withStore(fn: (store: Store) => Promise<void> | void) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "event-recruit-test-"));
    try {
      await fn(new Store(join(dir, "state.json")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test("buildListContent: 長いタイトルが多くても 2,000 文字以内に収まる", () => {
  const events = Array.from({ length: 20 }, (_, i) =>
    makeEvent(`id${String(i).padStart(4, "0")}`, { title: "あ".repeat(100) }),
  );
  const content = buildListContent(events);
  assert.ok(content.length <= 2000, `content length ${content.length}`);
  assert.match(content, /…ほか \d+ 件/);
});

test("buildListContent: 少件数では全件を表示し、残件数の注記は付けない", () => {
  const content = buildListContent([makeEvent("abc123"), makeEvent("def456")]);
  assert.match(content, /abc123/);
  assert.match(content, /def456/);
  assert.doesNotMatch(content, /ほか/);
});

test(
  "handleCommand create: 冒頭で deferReply し、reply は使わない",
  withStore(async (store) => {
    const calls: string[] = [];
    let sentOptions: Record<string, unknown> | null = null;
    let editedOptions: Record<string, unknown> | null = null;
    const interaction = {
      guildId: "g1",
      channelId: "c1",
      channel: {
        send: async (opts: Record<string, unknown>) => {
          calls.push("send");
          sentOptions = opts;
          return { id: "m999" };
        },
      },
      user: { id: "owner" },
      options: {
        getSubcommand: () => "create",
        getString: (name: string) =>
          name === "title"
            ? "テスト <@123456>"
            : name === "datetime"
              ? "2099-01-01 10:00"
              : null,
      },
      deferReply: async () => {
        calls.push("deferReply");
      },
      editReply: async (opts: Record<string, unknown>) => {
        calls.push("editReply");
        editedOptions = opts;
      },
      reply: async () => {
        calls.push("reply");
      },
    };
    await handleCommand(interaction as never, store);
    assert.equal(calls[0], "deferReply");
    assert.ok(calls.indexOf("deferReply") < calls.indexOf("send"));
    assert.ok(!calls.includes("reply"));
    assert.deepEqual(must(sentOptions).allowedMentions, { parse: [] });
    assert.deepEqual(must(editedOptions).allowedMentions, { parse: [] });
    assert.equal(store.allEvents().length, 1);
    assert.equal(store.allEvents()[0]?.messageId, "m999");
  }),
);

test(
  "handleCommand close: 冒頭で deferReply し、editReply で結果を返す",
  withStore(async (store) => {
    store.addEvent(makeEvent("abc123", { messageId: null }));
    const calls: string[] = [];
    let editedOptions: Record<string, unknown> | null = null;
    const interaction = {
      guildId: "g1",
      channelId: "c1",
      user: { id: "owner" },
      memberPermissions: { has: () => false },
      client: { channels: { fetch: async () => null } },
      options: {
        getSubcommand: () => "close",
        getString: () => "abc123",
      },
      deferReply: async () => {
        calls.push("deferReply");
      },
      editReply: async (opts: Record<string, unknown>) => {
        calls.push("editReply");
        editedOptions = opts;
      },
      reply: async () => {
        calls.push("reply");
      },
    };
    await handleCommand(interaction as never, store);
    assert.equal(calls[0], "deferReply");
    assert.ok(!calls.includes("reply"));
    assert.match(String(must(editedOptions).content), /締め切りました/);
    assert.deepEqual(must(editedOptions).allowedMentions, { parse: [] });
    assert.equal(store.findEvent("abc123")?.status, "closed");
  }),
);

test(
  "handleCommand list: allowedMentions でメンションを無効化する",
  withStore(async (store) => {
    store.addEvent(makeEvent("abc123", { title: "告知 <@123456> @everyone" }));
    let repliedOptions: Record<string, unknown> | null = null;
    const interaction = {
      guildId: "g1",
      options: { getSubcommand: () => "list" },
      reply: async (opts: Record<string, unknown>) => {
        repliedOptions = opts;
      },
    };
    await handleCommand(interaction as never, store);
    assert.deepEqual(must(repliedOptions).allowedMentions, { parse: [] });
    assert.ok(String(must(repliedOptions).content).length <= 2000);
  }),
);

test(
  "Scheduler fireRemind: allowedMentions でタイトル由来のメンションを無効化する",
  withStore(async (store) => {
    const event = makeEvent("abc123", { title: "告知 <@123456>" });
    store.addEvent(event);
    let sentOptions: Record<string, unknown> | null = null;
    const channel = {
      isTextBased: () => true,
      send: async (opts: Record<string, unknown>) => {
        sentOptions = opts;
      },
    };
    const scheduler = new Scheduler({
      store,
      client: { channels: { fetch: async () => channel } } as never,
      log: () => undefined,
    });
    await (scheduler as never as { fireRemind: (e: EventRecord) => Promise<void> }).fireRemind(
      event,
    );
    assert.deepEqual(must(sentOptions).allowedMentions, { parse: [] });
    assert.equal(event.reminded, true);
  }),
);

test(
  "Scheduler fireStart: 参加者へのメンションだけを許可する",
  withStore(async (store) => {
    const event = makeEvent("abc123", {
      messageId: null,
      rsvps: { u1: "join", u2: "join" },
    });
    store.addEvent(event);
    let sentOptions: Record<string, unknown> | null = null;
    const channel = {
      isTextBased: () => true,
      send: async (opts: Record<string, unknown>) => {
        sentOptions = opts;
      },
    };
    const scheduler = new Scheduler({
      store,
      client: { channels: { fetch: async () => channel } } as never,
      log: () => undefined,
    });
    await (scheduler as never as { fireStart: (e: EventRecord) => Promise<void> }).fireStart(
      event,
    );
    assert.deepEqual(must(sentOptions).allowedMentions, { parse: [], users: ["u1", "u2"] });
    assert.equal(event.status, "started");
    assert.equal(event.startedNotified, true);
  }),
);
