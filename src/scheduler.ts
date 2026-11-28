// ==========================================
// ⏰ スケジューラ（締切リマインドと開始通知）
// ==========================================
// 📝 1分間隔でイベントを確認し、締切1時間前のリマインドと開始通知を
// 送る。送信済みフラグは状態ファイルに残るため、再起動しても重複して
// 送ることはない。Bot が止まっていた間に過ぎた分も、復帰後の確認で
// まとめて処理する。メンションは参加者へのものだけを明示的に許可し、
// タイトルなどユーザー入力由来のメンションは発火させない。
import type { Client, TextChannel } from "discord.js";
import { refreshEventMessage } from "./commands.js";
import { eventEmbed, jumpUrl } from "./embeds.js";
import { dueActions, rsvpGroups, type EventRecord } from "./events.js";
import type { Store } from "./store.js";
import { discordTimestamp } from "./time.js";

// 🔁 確認間隔（1分）
const TICK_MS = 60 * 1000;

export interface SchedulerDeps {
  store: Store;
  client: Client;
  log: (msg: string) => void;
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private deps: SchedulerDeps) {}

  // ▶️ 起動直後に1回確認し、その後は1分間隔で回す
  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // 🔍 全イベントを確認し、必要な自動処理を実行する（多重実行は防ぐ）
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      for (const event of this.deps.store.allEvents()) {
        for (const action of dueActions(event, now)) {
          try {
            if (action === "remind") await this.fireRemind(event);
            else await this.fireStart(event);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.deps.log(
              `自動処理 (${action}) に失敗しました [${event.id} ${event.title}]: ${message}`,
            );
          }
        }
      }
    } finally {
      this.running = false;
    }
  }

  // 📨 イベントの投稿先チャンネルを取得する（送信できない形なら null）
  private async fetchChannel(event: EventRecord): Promise<TextChannel | null> {
    const channel = await this.deps.client.channels.fetch(event.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !("send" in channel)) return null;
    return channel as TextChannel;
  }

  // ----- ⏰ 締切1時間前のリマインド -----
  private async fireRemind(event: EventRecord): Promise<void> {
    const channel = await this.fetchChannel(event);
    if (!channel) throw new Error(`チャンネル ${event.channelId} が見つかりません`);
    await channel.send({
      content:
        `⏰ **締切まもなく**\n` +
        `「${event.title}」の参加受付は ${discordTimestamp(event.deadlineAt, "R")} に締め切ります。\n` +
        `参加・未定の回答はお早めに！ [募集投稿へ](${jumpUrl(event)})`,
      // タイトルはユーザー入力のためメンションとして解釈させない
      allowedMentions: { parse: [] },
    });
    event.reminded = true;
    this.deps.store.updateEvent(event);
    this.deps.log(`リマインドを送信しました: ${event.title} (${event.id})`);
  }

  // ----- 🔔 開始通知とスレッド作成 -----
  private async fireStart(event: EventRecord): Promise<void> {
    const channel = await this.fetchChannel(event);
    if (!channel) throw new Error(`チャンネル ${event.channelId} が見つかりません`);
    const joinUsers = rsvpGroups(event.rsvps).join;
    const mentions = joinUsers
      .slice(0, 50)
      .map((id) => `<@${id}>`)
      .join(" ");

    // 🧵 募集投稿に公開スレッドを作り、参加者を招待する
    if (!event.threadId && event.messageId) {
      try {
        const message = await channel.messages.fetch(event.messageId);
        const thread = await message.startThread({
          name: event.title.slice(0, 100),
          autoArchiveDuration: 1440,
        });
        event.threadId = thread.id;
        this.deps.store.updateEvent(event);
        await thread.send({
          content:
            `🎉 「${event.title}」の参加者スレッドです。\n` +
            `${mentions ? `${mentions}\n` : ""}よろしくお願いします！`,
          // 参加者へのメンションだけを許可する（タイトル由来は発火させない）
          allowedMentions: { parse: [], users: joinUsers.slice(0, 50) },
        });
        for (const userId of joinUsers) {
          try {
            await thread.members.add(userId);
          } catch {
            // チャンネルを見られない人などは追加できない（メンションで気付いてもらう）
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.log(`スレッド作成に失敗しました [${event.id}]: ${message}`);
      }
    }

    await channel.send({
      content:
        `🔔 **「${event.title}」が始まります！**\n` +
        (joinUsers.length > 0
          ? `${mentions}\n参加のみなさんは集合してください。`
          : "参加の回答はありませんでした。") +
        (event.threadId ? `\n🧵 スレッド: <#${event.threadId}>` : ""),
      embeds: [eventEmbed(event)],
      // 参加者へのメンションだけを許可する（タイトル由来は発火させない）
      allowedMentions: { parse: [], users: joinUsers.slice(0, 50) },
    });
    event.startedNotified = true;
    event.status = "started";
    this.deps.store.updateEvent(event);
    await refreshEventMessage({ client: this.deps.client }, event);
    this.deps.log(`開始通知を送信しました: ${event.title} (${event.id})`);
  }
}
