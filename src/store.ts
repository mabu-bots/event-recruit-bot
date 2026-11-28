// ==========================================
// 💾 状態ストア（JSON ファイル）
// ==========================================
// 📝 イベントの記録を JSON ファイルに保持する。書き込みは一時ファイルへ
// 書いてから rename する原子的（atomic）な方式で、書き込み途中の終了で
// ファイルが壊れないようにする。読み込みに失敗した場合は、元ファイルを
// 退避してから空の状態で起動する（無言で上書きして全データを失わない）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EventRecord } from "./events.js";

// ----- 🧩 状態の形 -----
export interface State {
  events: EventRecord[];
}

export function emptyState(): State {
  return { events: [] };
}

// 🗑️ 終了したイベントの保持上限（開始済み・中止を古い順に間引く）
const FINISHED_CAP = 200;

// ----- 🗄️ ストア本体 -----
export class Store {
  private state: State;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.state = emptyState();
    if (!existsSync(path)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch (err) {
      // ⚠️ 壊れた状態ファイルで Bot を止めない。ただし元ファイルは退避し、
      // エラーログを残す（このまま保存すると復旧不能になるため）
      const message = err instanceof Error ? err.message : String(err);
      console.error(`状態ファイルの読み込みに失敗しました (${path}): ${message}`);
      this.keepCorruptFileAside(message);
      return;
    }

    if (parsed !== null && typeof parsed === "object" && Array.isArray((parsed as State).events)) {
      this.state = { events: (parsed as State).events };
    } else {
      // ⚠️ 形が不正なファイルも破損として扱う（無言で捨てない）
      this.keepCorruptFileAside("状態ファイルの形式が不正です");
    }
  }

  // 🛟 破損した状態ファイルを別名へ退避する。退避自体が失敗しても
  // ログだけ残して起動は続行する
  private keepCorruptFileAside(reason: string): void {
    try {
      const backupPath = `${this.path}.corrupt-${Date.now()}`;
      renameSync(this.path, backupPath);
      console.error(`破損した状態ファイルを退避しました: ${this.path} -> ${backupPath} (${reason})`);
    } catch (backupErr) {
      const message = backupErr instanceof Error ? backupErr.message : String(backupErr);
      console.error(`破損した状態ファイルの退避に失敗しました (${this.path}): ${message}`);
    }
  }

  get data(): State {
    return this.state;
  }

  // ✍️ 現在の状態を保存する（間引き → 一時ファイル → rename）
  save(): void {
    this.trimFinished();
    mkdirSync(dirname(this.path), { recursive: true });
    const tmpPath = `${this.path}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), "utf-8");
    renameSync(tmpPath, this.path);
  }

  // 🗑️ 終了済み（started / cancelled）が上限を超えたら古い順に間引く
  private trimFinished(): void {
    const finished = this.state.events.filter(
      (e) => e.status === "started" || e.status === "cancelled",
    );
    if (finished.length <= FINISHED_CAP) return;
    const dropIds = new Set(
      [...finished]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, finished.length - FINISHED_CAP)
        .map((e) => e.id),
    );
    this.state.events = this.state.events.filter((e) => !dropIds.has(e.id));
  }

  // ----- 🎪 イベントの操作 -----
  addEvent(event: EventRecord): void {
    this.state.events.push(event);
    this.save();
  }

  findEvent(id: string): EventRecord | undefined {
    return this.state.events.find((e) => e.id === id);
  }

  // 🔄 変更したイベントで置き換えて保存する（無ければ追加する）
  updateEvent(event: EventRecord): void {
    const index = this.state.events.findIndex((e) => e.id === event.id);
    if (index >= 0) {
      this.state.events[index] = event;
    } else {
      this.state.events.push(event);
    }
    this.save();
  }

  eventsForGuild(guildId: string): EventRecord[] {
    return this.state.events.filter((e) => e.guildId === guildId);
  }

  allEvents(): EventRecord[] {
    return [...this.state.events];
  }
}
