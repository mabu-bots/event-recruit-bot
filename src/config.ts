// ==========================================
// ⚙️ 設定の読み込み（環境変数）
// ==========================================
// 📝 .env から読み込む Bot の設定。必須の環境変数が欠けていたら、
// 理由を明示して起動を止める。値そのものはここでは保持するだけで、
// ログには出さない。

export interface Config {
  // 🔑 Discord Bot のトークン
  token: string;
  // 🆔 Discord アプリケーションのクライアント ID
  clientId: string;
  // 🏠 開発用にコマンドを即時登録するギルド ID（未指定なら null）
  guildId: string | null;
  // 💾 状態ファイルの保存先パス
  statePath: string;
}

// 📌 必須の環境変数を読み取る。空文字・空白だけの場合も未設定として扱う
function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません（.env を確認してください）`);
  }
  return value;
}

// 📌 環境変数から Config を組み立てる
export function loadConfig(): Config {
  const guild = process.env.GUILD_ID?.trim();
  return {
    token: readRequired("DISCORD_TOKEN"),
    clientId: readRequired("CLIENT_ID"),
    guildId: guild ? guild : null,
    statePath: process.env.STATE_PATH?.trim() || "data/state.json",
  };
}
