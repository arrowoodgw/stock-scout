import { promises as fs } from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');

type FileCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function safeCacheKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function readFileCache<T>(key: string): Promise<T | null> {
  try {
    const filePath = path.join(CACHE_DIR, `${safeCacheKey(key)}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    const entry = JSON.parse(raw) as FileCacheEntry<T>;

    if (entry.expiresAt <= Date.now()) {
      return null;
    }

    return entry.value;
  } catch {
    return null;
  }
}

export async function writeFileCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  try {
    await ensureCacheDir();
    const filePath = path.join(CACHE_DIR, `${safeCacheKey(key)}.json`);
    const entry: FileCacheEntry<T> = {
      expiresAt: Date.now() + ttlMs,
      value
    };
    await fs.writeFile(filePath, JSON.stringify(entry), 'utf8');
  } catch {
    // Cache writes are best-effort; failure is non-fatal
  }
}
