// ==========================================
// ⌨️ スラッシュコマンドとボタン処理
// ==========================================
// 📝 /event コマンド（create / list / close / cancel）の定義と処理、
// および募集投稿の RSVP ボタンの処理。投稿の送信など API 呼び出しを
// 伴うハンドラは、初回応答の3秒制限を超えないよう冒頭で defer する。
// 送信時のメンションは既定で無効化し、許可する箇所だけ明示する。
import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { eventEmbed, jumpUrl, parseRsvpCustomId, rsvpButtons } from "./embeds.js";
import {
  applyRsvp,
  canManage,
  generateEventId,
  rsvpGroups,
  type EventRecord,
} from "./events.js";
import type { Store } from "./store.js";
import { discordTimestamp, parseDateTimeJst } from "./time.js";

// ----- 📐 コマンド定義 -----
export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("event")
    .setDescription("イベントの参加募集を管理します")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("イベントの募集を投稿します")
        .addStringOption((opt) =>
          opt.setName("title").setDescription("イベント名").setRequired(true).setMaxLength(100),
        )
        .addStringOption((opt) =>
          opt
            .setName("datetime")
            .setDescription("開始日時 (例: 2026-11-23 19:00、日本時間)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("説明 (任意)")
            .setRequired(false)
            .setMaxLength(1000),
        )
        .addStringOption((opt) =>
          opt
            .setName("deadline")
            .setDescription("締切日時 (例: 2026-11-23 18:00、省略時は開始時刻)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("募集中のイベント一覧を表示します"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("募集を締め切ります (作成者またはサーバー管理権限)")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("イベントID (募集投稿の下部に表示)").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("イベントを中止します (作成者またはサーバー管理権限)")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("イベントID (募集投稿の下部に表示)").setRequired(true),
        ),
    ),
];

// 📤 登録用に JSON 化したコマンド定義
export const commandData = commandBuilders.map((builder) => builder.toJSON());

// ----- 📋 一覧表示の組み立て -----
// 📏 /event list の本文上限（Discord の通常メッセージ上限 2,000 文字から余裕を取る）
export const LIST_CONTENT_LIMIT = 1900;

// 📋 募集中イベントの一覧本文を組み立てる。件数の上限に加えて、
// 累計の文字数でも打ち切り、残りは「…ほか N 件」と注記する
export function buildListContent(open: EventRecord[]): string {
  const lines = open.slice(0, 20).map((event) => {
    const groups = rsvpGroups(event.rsvps);
    return (
      `**${event.title}** (ID: \`${event.id}\`)\n` +
      `🕖 ${discordTimestamp(event.startAt, "F")} / ✅ ${groups.join.length} ・ ❓ ${groups.maybe.length} ・ ✖ ${groups.decline.length}\n` +
      `[募集投稿へ](${jumpUrl(event)})`
    );
  });
  const shown: string[] = [];
  let length = 0;
  for (const line of lines) {
    const nextLength = shown.length === 0 ? line.length : length + 2 + line.length;
    // 📝 残件数の注記（最大でも "\n\n…ほか 999 件" 程度）を付ける余地を残す
    const reserve = shown.length + 1 < lines.length || open.length > lines.length ? 20 : 0;
    if (nextLength + reserve > LIST_CONTENT_LIMIT && shown.length > 0) break;
    shown.push(line);
    length = nextLength;
  }
  const remaining = open.length - shown.length;
  if (remaining > 0) shown.push(`…ほか ${remaining} 件`);
  return shown.join("\n\n");
}

// ----- 🎛️ ハンドラ -----
export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  store: Store,
): Promise<void> {
  switch (interaction.options.getSubcommand()) {
    case "create":
      return handleCreate(interaction, store);
    case "list":
      return handleList(interaction, store);
    case "close":
      return handleFinish(interaction, store, "close");
    case "cancel":
      return handleFinish(interaction, store, "cancel");
  }
}

// 📢 /event create: 募集投稿を作る
async function handleCreate(
  interaction: ChatInputCommandInteraction,
  store: Store,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.guildId || !interaction.channel || !("send" in interaction.channel)) {
    await interaction.editReply({ content: "テキストチャンネルで実行してください。" });
    return;
  }

  const title = interaction.options.getString("title", true);
  const datetimeRaw = interaction.options.getString("datetime", true);
  const description = interaction.options.getString("description") ?? "";
  const deadlineRaw = interaction.options.getString("deadline");

  const startAt = parseDateTimeJst(datetimeRaw);
  if (startAt === null) {
    await interaction.editReply({
      content: `開始日時「${datetimeRaw}」を読み取れませんでした。"2026-11-23 19:00" の形式で入力してください。`,
      allowedMentions: { parse: [] },
    });
    return;
  }
  let deadlineAt = startAt;
  if (deadlineRaw) {
    const parsedDeadline = parseDateTimeJst(deadlineRaw);
    if (parsedDeadline === null) {
      await interaction.editReply({
        content: `締切日時「${deadlineRaw}」を読み取れませんでした。"2026-11-23 18:00" の形式で入力してください。`,
        allowedMentions: { parse: [] },
      });
      return;
    }
    deadlineAt = parsedDeadline;
  }

  const now = Date.now();
  if (startAt <= now) {
    await interaction.editReply({
      content: "開始時刻が過去になっています。未来の日時を指定してください。",
    });
    return;
  }
  if (deadlineAt > startAt) {
    await interaction.editReply({ content: "締切は開始時刻より前に設定してください。" });
    return;
  }
  if (deadlineAt <= now) {
    await interaction.editReply({
      content: "締切が過去になっています。未来の日時を指定してください。",
    });
    return;
  }

  const event: EventRecord = {
    id: generateEventId(new Set(store.allEvents().map((e) => e.id))),
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: null,
    creatorId: interaction.user.id,
    title,
    description,
    startAt,
    deadlineAt,
    status: "open",
    rsvps: {},
    reminded: false,
    startedNotified: false,
    threadId: null,
    createdAt: now,
  };
  const row = rsvpButtons(event);
  const message = await (interaction.channel as TextChannel).send({
    embeds: [eventEmbed(event)],
    components: row ? [row] : [],
    allowedMentions: { parse: [] },
  });
  event.messageId = message.id;
  store.addEvent(event);
  await interaction.editReply({
    content: `募集を投稿しました: ${jumpUrl(event)}`,
    allowedMentions: { parse: [] },
  });
}

// 📋 /event list: 募集中の一覧を出す
async function handleList(
  interaction: ChatInputCommandInteraction,
  store: Store,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "サーバー内で実行してください。",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  const open = store
    .eventsForGuild(interaction.guildId)
    .filter((e) => e.status === "open")
    .sort((a, b) => a.startAt - b.startAt);
  if (open.length === 0) {
    await interaction.reply({
      content: "現在募集中のイベントはありません。",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  await interaction.reply({ content: buildListContent(open), allowedMentions: { parse: [] } });
}

// 🔚 /event close・cancel の共通処理
async function handleFinish(
  interaction: ChatInputCommandInteraction,
  store: Store,
  action: "close" | "cancel",
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!interaction.guildId) {
    await interaction.editReply({ content: "サーバー内で実行してください。" });
    return;
  }
  const id = interaction.options.getString("id", true).trim();
  const event = store.findEvent(id);
  if (!event || event.guildId !== interaction.guildId) {
    await interaction.editReply({
      content: `イベントID「${id}」が見つかりませんでした。`,
      allowedMentions: { parse: [] },
    });
    return;
  }
  const hasManageGuild =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  if (!canManage(event, interaction.user.id, hasManageGuild)) {
    await interaction.editReply({
      content: "締切・中止ができるのはイベントの作成者か、サーバー管理権限のある人だけです。",
    });
    return;
  }
  const allowedFrom: EventRecord["status"][] = action === "close" ? ["open"] : ["open", "closed"];
  if (!allowedFrom.includes(event.status)) {
    await interaction.editReply({ content: "このイベントはすでに終了しています。" });
    return;
  }
  event.status = action === "close" ? "closed" : "cancelled";
  store.updateEvent(event);
  await refreshEventMessage(interaction, event);
  await interaction.editReply({
    content:
      action === "close"
        ? `「${event.title}」の募集を締め切りました。`
        : `「${event.title}」を中止しました。`,
    allowedMentions: { parse: [] },
  });
}

// 🔄 募集投稿の Embed を現在の状態に合わせて更新する。
// 投稿が削除されている等で失敗しても例外にはしない（状態は保存済み）
export async function refreshEventMessage(
  source: { client: Client },
  event: EventRecord,
): Promise<void> {
  if (!event.messageId) return;
  try {
    const channel = await source.client.channels.fetch(event.channelId);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(event.messageId);
    const row = rsvpButtons(event);
    await message.edit({
      embeds: [eventEmbed(event)],
      components: row ? [row] : [],
      allowedMentions: { parse: [] },
    });
  } catch {
    // 投稿が無い・権限が無い等は無視する
  }
}

// ----- 🔘 RSVP ボタンの処理 -----
export async function handleButton(
  interaction: ButtonInteraction,
  store: Store,
): Promise<void> {
  const parsed = parseRsvpCustomId(interaction.customId);
  if (!parsed) return;
  const event = store.findEvent(parsed.eventId);
  if (!event) {
    await interaction.reply({
      content: "この募集は見つかりませんでした。",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (event.status !== "open") {
    await interaction.reply({
      content: "この募集は終了しています。",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  event.rsvps = applyRsvp(event.rsvps, interaction.user.id, parsed.kind);
  store.updateEvent(event);
  const row = rsvpButtons(event);
  await interaction.update({
    embeds: [eventEmbed(event)],
    components: row ? [row] : [],
    allowedMentions: { parse: [] },
  });
}
