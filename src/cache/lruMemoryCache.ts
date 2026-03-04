// src/cache/lruMemoryCache.ts

export class LRUMemoryCache<K, V> {
    private capacity: number;
    private cache: Map<K, V>;

    constructor(capacity: number = 1000) {
        this.capacity = capacity;
        this.cache = new Map<K, V>();
    }

    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }
        // LRUの更新：一度削除して最後に再挿入することで最新にする
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            // 容量オーバー時、最初の要素（最も古い要素）を削除
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }
}

export const memoryCache = new LRUMemoryCache<string, string>(1000);