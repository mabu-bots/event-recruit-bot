// ==========================================
// 📢 募集 Embed と RSVP ボタン
// ==========================================
// 📝 募集投稿の見た目を組み立てる。参加者リストは Embed フィールドの
// 上限に収まるよう件数を絞り、人数そのものは正確に表示する。
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { RSVP_LABELS, rsvpGroups, type EventRecord, type RsvpKind } from "./events.js";
import { discordTimestamp } from "./time.js";

// ----- 📌 状態ごとの表示 -----
const STATUS_VIEW: Record<EventRecord["status"], { label: string; color: number }> = {
  open: { label: "募集中", color: 0x2ecc71 },
  closed: { label: "締切済み", color: 0x95a5a6 },
  cancelled: { label: "中止", color: 0xe74c3c },
  started: { label: "開始済み", color: 0x3498db },
};

// 🔗 募集投稿へのジャンプ URL
export function jumpUrl(event: EventRecord): string {
  return `https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId ?? ""}`;
}

// 👥 メンションの一覧文字列。最大40件まで並べ、残りは「ほか N 名」とする
function mentionList(userIds: string[]): string {
  if (userIds.length === 0) return "まだいません";
  const shown = userIds.slice(0, 40).map((id) => `<@${id}>`);
  const rest = userIds.length - shown.length;
  return shown.join(" ") + (rest > 0 ? ` ほか${rest}名` : "");
}

// ----- 📢 募集 Embed -----
export function eventEmbed(event: EventRecord): EmbedBuilder {
  const status = STATUS_VIEW[event.status];
  const groups = rsvpGroups(event.rsvps);
  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setTitle(`📢 ${event.title}`)
    .addFields(
      {
        name: "🕖 開始",
        value: `${discordTimestamp(event.startAt, "F")} (${discordTimestamp(event.startAt, "R")})`,
        inline: true,
      },
      { name: "⏰ 締切", value: discordTimestamp(event.deadlineAt, "F"), inline: true },
      { name: "📌 状態", value: status.label, inline: true },
      { name: "主催", value: `<@${event.creatorId}>`, inline: true },
      { name: `✅ ${RSVP_LABELS.join} (${groups.join.length})`, value: mentionList(groups.join) },
      { name: `❓ ${RSVP_LABELS.maybe} (${groups.maybe.length})`, value: mentionList(groups.maybe) },
      {
        name: `✖ ${RSVP_LABELS.decline} (${groups.decline.length})`,
        value: mentionList(groups.decline),
      },
    )
    .setFooter({ text: `イベントID: ${event.id}` });
  if (event.description) embed.setDescription(event.description);
  if (event.threadId) {
    embed.addFields({ name: "🧵 スレッド", value: `<#${event.threadId}>`, inline: true });
  }
  return embed;
}

// ----- 🔘 RSVP ボタン -----
// 🏷️ ボタンの customId は "rsvp:<イベントID>:<区分>" の形
export function rsvpCustomId(eventId: string, kind: RsvpKind): string {
  return `rsvp:${eventId}:${kind}`;
}

export function parseRsvpCustomId(
  customId: string,
): { eventId: string; kind: RsvpKind } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== "rsvp") return null;
  const kind = parts[2];
  if (kind !== "join" && kind !== "maybe" && kind !== "decline") return null;
  return { eventId: parts[1], kind };
}

const BUTTON_VIEW: Record<RsvpKind, { emoji: string; style: ButtonStyle }> = {
  join: { emoji: "✅", style: ButtonStyle.Success },
  maybe: { emoji: "❓", style: ButtonStyle.Secondary },
  decline: { emoji: "✖", style: ButtonStyle.Secondary },
};

// 🔘 ボタンの行を組み立てる。募集中のときだけ返し、終了した募集では
// null を返してボタンを外す
export function rsvpButtons(event: EventRecord): ActionRowBuilder<ButtonBuilder> | null {
  if (event.status !== "open") return null;
  const groups = rsvpGroups(event.rsvps);
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const kind of Object.keys(BUTTON_VIEW) as RsvpKind[]) {
    const view = BUTTON_VIEW[kind];
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(rsvpCustomId(event.id, kind))
        .setLabel(`${RSVP_LABELS[kind]} (${groups[kind].length})`)
        .setEmoji(view.emoji)
        .setStyle(view.style),
    );
  }
  return row;
}
