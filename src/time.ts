// ==========================================
// 🕖 時刻ユーティリティ（純粋関数）
// ==========================================
// 📝 ユーザーが入力する日時はすべて Asia/Tokyo（JST）として解釈する。
// JST は UTC+9 固定で夏時間がないため、換算はオフセットの引き算で済む。
// ここは外部状態に触れない純粋関数だけを置く。

// 🌏 JST と UTC の差分（9時間）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ----- 📥 日時文字列のパース -----
// "2026-11-23 19:00" 形式を epoch ミリ秒へ変換する。
// 区切りは "-" でも "/" でも可、秒は省略可。解釈できない入力や
// 存在しない日付（2月30日など）の場合は null を返す。
export function parseDateTimeJst(input: string): number | null {
  const matched = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
    input.trim(),
  );
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const hour = Number(matched[4]);
  const minute = Number(matched[5]);
  const second = matched[6] ? Number(matched[6]) : 0;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - JST_OFFSET_MS;

  // 🔁 繰り上がり検出: JST へ往復させて元の年月日・時刻と一致しなければ
  // 存在しない日付だったとみなす
  const roundTrip = new Date(utcMs + JST_OFFSET_MS);
  const consistent =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day &&
    roundTrip.getUTCHours() === hour &&
    roundTrip.getUTCMinutes() === minute;
  return consistent ? utcMs : null;
}

// ----- 🖨️ 表示用整形 -----
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 📅 epoch ミリ秒を "2026/11/23(月) 19:00"（JST・曜日つき）へ整形する
export function formatJst(epochMs: number): string {
  const shifted = new Date(epochMs + JST_OFFSET_MS);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const datePart =
    `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}` +
    `(${WEEKDAY_LABELS[shifted.getUTCDay()]})`;
  return `${datePart} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

// 💬 Discord のタイムスタンプ記法（閲覧者のローカル時刻で表示される）
export function discordTimestamp(epochMs: number, style: "F" | "R" = "F"): string {
  return `<t:${Math.floor(epochMs / 1000)}:${style}>`;
}
