// src/cache/translationCache.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
// better-sqlite3はネイティブモジュールのため動的importを使う。
// 静的importにするとElectronバージョン不一致でモジュール全体のロードが失敗し
// activate()が呼ばれずコマンドが登録されない問題が起きる。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqliteDatabase = any;

export class TranslationCache {
    private db: SqliteDatabase | null = null;
    private readonly ttlMs: number;

    constructor(context: vscode.ExtensionContext) {
        // 設定からTTLを取得（デフォルト7日）
        const config = vscode.workspace.getConfiguration('rosettaLens');
        const ttlDays = config.get<number>('cacheTTLDays', 7);
        this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;

        try {
            // 動的requireでネイティブモジュールのロード失敗を局所化する
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Database = require('better-sqlite3');

            // 拡張機能のグローバルストレージパスを確保
            const storageUri = context.globalStorageUri;
            if (!fs.existsSync(storageUri.fsPath)) {
                fs.mkdirSync(storageUri.fsPath, { recursive: true });
            }

            const dbPath = path.join(storageUri.fsPath, 'rosetta_cache.db');
            this.db = new Database(dbPath);

            // テーブル作成
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    expires_at INTEGER
                )
            `);
        } catch (error) {
            console.error('[Rosetta Lens] SQLite初期化エラー. インメモリにフォールバックします:', error);
            this.db = null;
        }
    }

    // スコープと識別子名からSHA-256ハッシュキーを生成
    public generateKey(name: string, scope: string): string {
        const rawKey = `${name}::${scope}`;
        return crypto.createHash('sha256').update(rawKey).digest('hex');
    }

    public get(key: string): string | null {
        if (!this.db) return null;

        try {
            const stmt = this.db.prepare('SELECT value, expires_at FROM cache WHERE key = ?');
            const row = stmt.get(key) as { value: string, expires_at: number } | undefined;

            if (!row) return null;

            // TTLチェック
            if (Date.now() > row.expires_at) {
                this.db.prepare('DELETE FROM cache WHERE key = ?').run(key);
                return null;
            }

            return row.value;
        } catch (error) {
            console.error('[Rosetta Lens] キャッシュ取得エラー:', error);
            return null;
        }
    }

    public set(key: string, value: string): void {
        if (!this.db) return;

        try {
            const expiresAt = Date.now() + this.ttlMs;
            const stmt = this.db.prepare(`
                INSERT INTO cache (key, value, expires_at) 
                VALUES (?, ?, ?) 
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
            `);
            stmt.run(key, value, expiresAt);
        } catch (error) {
            console.error('[Rosetta Lens] キャッシュ保存エラー:', error);
        }
    }

    public clear(): void {
        if (!this.db) return;
        try {
            this.db.prepare('DELETE FROM cache').run();
        } catch (error) {
            console.error('[Rosetta Lens] キャッシュクリアエラー:', error);
        }
    }

    /** DBコネクションを閉じる（拡張機能のdeactivate時に必ず呼ぶこと） */
    public dispose(): void {
        if (this.db && this.db.open) {
            this.db.close();
            this.db = null;
        }
    }
}