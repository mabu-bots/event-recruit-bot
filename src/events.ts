// ==========================================
// 🎪 イベントと RSVP のドメインロジック（純粋関数）
// ==========================================
// 📝 募集イベントの記録型と、RSVP の状態遷移・自動処理の要否判定。
// Discord API には触れない純粋関数だけを集め、テスト可能に保つ。
import { randomInt } from "node:crypto";

// ----- 🧩 型定義 -----
// ✋ 回答の区分
export type RsvpKind = "join" | "maybe" | "decline";

// 📌 イベントの状態
export type EventStatus = "open" | "closed" | "cancelled" | "started";

// 💾 1件の募集イベントの記録（状態ファイルにそのまま保存される形）
export interface EventRecord {
  // 🏷️ /event close・cancel で指定する短い ID
  id: string;
  guildId: string;
  channelId: string;
  // 📨 募集投稿のメッセージ ID（投稿が完了するまでは null）
  messageId: string | null;
  creatorId: string;
  title: string;
  description: string;
  // 🕖 開始時刻と締切（epoch ミリ秒）
  startAt: number;
  deadlineAt: number;
  status: EventStatus;
  // 👥 ユーザー ID → 回答区分
  rsvps: Record<string, RsvpKind>;
  // ⏰ 締切1時間前リマインドを送信済みか
  reminded: boolean;
  // 🔔 開始通知を送信済みか
  startedNotified: boolean;
  // 🧵 開始時に作成したスレッドの ID
  threadId: string | null;
  createdAt: number;
}

export const RSVP_KINDS: RsvpKind[] = ["join", "maybe", "decline"];

export const RSVP_LABELS: Record<RsvpKind, string> = {
  join: "参加",
  maybe: "未定",
  decline: "不参加",
};

// ----- 🆔 ID 生成 -----
// 🔤 紛らわしい文字（0/O、1/l/I）を除いた英数字から6文字の ID を作る
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateEventId(existing: ReadonlySet<string>): string {
  for (;;) {
    let candidate = "";
    for (let i = 0; i < 6; i++) {
      candidate += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
    }
    if (!existing.has(candidate)) return candidate;
  }
}

// ----- ✋ RSVP の状態遷移 -----
// 🔀 ボタン押下時の遷移: 未回答なら設定、別の区分なら移動、
// 同じ区分なら取り消し。引数の Record は変更せず、新しい Record を返す。
export function applyRsvp(
  rsvps: Record<string, RsvpKind>,
  userId: string,
  kind: RsvpKind,
): Record<string, RsvpKind> {
  const next: Record<string, RsvpKind> = { ...rsvps };
  if (next[userId] === kind) {
    delete next[userId];
  } else {
    next[userId] = kind;
  }
  return next;
}

// 👥 区分ごとにユーザー ID を振り分ける
export function rsvpGroups(rsvps: Record<string, RsvpKind>): Record<RsvpKind, string[]> {
  const groups: Record<RsvpKind, string[]> = { join: [], maybe: [], decline: [] };
  for (const [userId, kind] of Object.entries(rsvps)) {
    groups[kind].push(userId);
  }
  return groups;
}

// ----- 🔐 操作権限 -----
// 🛠️ 締切・中止ができるのは、作成者本人かサーバー管理（ManageGuild）
// 権限を持つ人だけとする
export function canManage(event: EventRecord, userId: string, hasManageGuild: boolean): boolean {
  return event.creatorId === userId || hasManageGuild;
}

// ----- ⏰ 自動処理の要否 -----
export type DueAction = "remind" | "start";

// 📋 その時点で必要な自動処理を返す。締切の1時間前を切ったら
// リマインド、開始時刻を過ぎたら開始通知。送信済みフラグが立っている
// ものと対象外の状態のものは出さない。
export function dueActions(event: EventRecord, now: number): DueAction[] {
  const actions: DueAction[] = [];
  if (event.status === "cancelled" || event.status === "started") return actions;
  if (event.status === "open" && !event.reminded && now >= event.deadlineAt - 60 * 60 * 1000) {
    actions.push("remind");
  }
  if (!event.startedNotified && now >= event.startAt) {
    actions.push("start");
  }
  return actions;
}
