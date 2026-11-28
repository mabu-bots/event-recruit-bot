// ==========================================
// 🚀 エントリポイント
// ==========================================
// 📝 Discord へログインし、コマンド登録・対話処理・スケジューラを
// 開始する。特権インテントは使わない（Guilds のみ）。
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commandData, handleButton, handleCommand } from "./commands.js";
import { loadConfig } from "./config.js";
import { logExecution } from "./execution-log.js";
import { startPresenceCycle } from "./presence-cycle.js";
import { Scheduler } from "./scheduler.js";
import { Store } from "./store.js";
import { attachReadyWatchdog } from "./watchdog.js";

const config = loadConfig();
const store = new Store(config.statePath);

// 🔇 既定ではメンションを一切発火させない（正当なメンション箇所は
// 送信ごとに allowedMentions で明示する）
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] },
});

// 🐕 READY が来ないサイレント停滞を検知して終了する（watchdog.ts）
attachReadyWatchdog(client);

// 🛡️ Client の error 系イベントの受け皿（無いと未処理のまま握りつぶされる）
client.on(Events.Error, (error) => {
  console.error("Discord クライアントでエラーが発生しました:", error);
});
client.on(Events.ShardError, (error) => {
  console.error("Discord シャードでエラーが発生しました:", error);
});

// 🛡️ 未処理の Promise rejection をログに残す（プロセスは落とさず、
// 個別の失敗は各ハンドラ側のエラーログとあわせて追えるようにする）
process.on("unhandledRejection", (reason) => {
  console.error("未処理の Promise rejection を検知しました:", reason);
});

// ----- 📤 コマンド登録（起動時に自動） -----
async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.token);
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commandData,
    });
    console.log(`コマンドをギルド ${config.guildId} に登録しました`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commandData });
    console.log("コマンドをグローバルに登録しました");
  }
}

// ----- ✅ ログイン完了時の初期化 -----
client.once(Events.ClientReady, (readyClient) => {
  startPresenceCycle(readyClient);
  const openCount = store.data.events.filter((e) => e.status === "open").length;
  console.log(`ログインしました: ${readyClient.user.tag} / 募集中イベント ${openCount} 件`);
  const scheduler = new Scheduler({
    store,
    client,
    log: (msg) => console.log(msg),
  });
  scheduler.start();
  console.log("スケジューラを開始しました (1分間隔)");
});

// ----- 💬 対話処理 -----
client.on(Events.InteractionCreate, async (interaction) => {
  // 📋 実行ログはスラッシュコマンド（/event）だけが対象。ボタンは対象外
  const isEventCommand = interaction.isChatInputCommand() && interaction.commandName === "event";
  const meta = isEventCommand
    ? {
        cmd: "event",
        route: "slash" as const,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
      }
    : null;
  try {
    if (isEventCommand) {
      await handleCommand(interaction, store);
      if (meta) logExecution({ ...meta, ok: true });
    } else if (interaction.isButton()) {
      await handleButton(interaction, store);
    }
  } catch (err) {
    if (meta) logExecution({ ...meta, ok: false, error: err });
    console.error("対話処理でエラーが発生しました:", err);
    const replyText = "処理中にエラーが発生しました。時間をおいて再度お試しください。";
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(replyText).catch(() => undefined);
      } else {
        await interaction.reply({ content: replyText, ephemeral: true }).catch(() => undefined);
      }
    }
  }
});

// ----- 🏁 起動 -----
// コマンド登録が一過性に失敗してもログインは続行し、ログイン失敗は
// 未処理 rejection にせず原因をログに残して異常終了する
try {
  await registerCommands();
} catch (err) {
  console.error("コマンド登録に失敗しました (ログインは続行します):", err);
}
try {
  await client.login(config.token);
} catch (err) {
  console.error("ログインに失敗しました。DISCORD_TOKEN とネットワークを確認してください:", err);
  process.exitCode = 1;
}
