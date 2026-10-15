import { Redis } from "@upstash/redis";
import type { Asset, Job, Quote } from "./types";
import { configuration } from "./config";
import { redisCredentials } from "./storage-config";
export function db() {
  const { url, token } = redisCredentials();
  if (!url || !token) throw new Error("Chưa kết nối nơi lưu tiến trình Redis.");
  return new Redis({ url, token });
}
export const key = (s: string) => `phosor:v1:${s}`;
export async function asset(id: string) {
  const a = await db().get<Asset>(key("asset:" + id));
  if (!a) throw new Error("Tệp không tồn tại hoặc đã bị xóa.");
  return a;
}
export async function job(id: string) {
  return db().get<Job>(key("job:" + id));
}
export async function saveJob(j: Job) {
  j.updatedAt = Date.now();
  await db().set(key("job:" + j.id), j);
}
export async function saveAsset(a: Asset) {
  await db().set(key("asset:" + a.id), a);
}
export async function getQuote(id: string) {
  return db().get<Quote>(key("quote:" + id));
}
export async function saveQuote(q: Quote) {
  await db().set(key("quote:" + q.id), q, { ex: 600 });
}
// Atomic: idempotency, daily reservation and a single active render across all tabs/instances.
export async function reserveJob(j: Job, idem: string) {
  const c = configuration();
  const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const amount = Math.ceil(j.quote.reserveUsd * 1e6),
    cap = Math.floor(c.dailyBudgetUsd * 1e6);
  if (j.quote.reserveUsd > c.maxJobUsd)
    throw new Error("Chi phí vượt hạn mức mỗi video.");
  const r = await db().eval<unknown[], string>(
    `
    local old=redis.call('GET',KEYS[1]); if old then return old end
    if redis.call('GET',KEYS[3]) then return 'BUSY' end
    local used=tonumber(redis.call('GET',KEYS[2]) or '0')
    if used+tonumber(ARGV[1])>tonumber(ARGV[2]) then return 'BUDGET' end
    redis.call('INCRBY',KEYS[2],ARGV[1]); redis.call('EXPIRE',KEYS[2],172800)
    redis.call('SET',KEYS[1],ARGV[3]); redis.call('SET',KEYS[3],ARGV[3])
    redis.call('SET',KEYS[4],ARGV[4]); redis.call('LPUSH',KEYS[5],ARGV[3]); return ARGV[3]
  `,
    [
      key("idem:" + idem),
      key("budget:" + date),
      key("active"),
      key("job:" + j.id),
      key("jobs"),
    ],
    [amount, cap, j.id, JSON.stringify(j)],
  );
  if (r === "BUSY")
    throw new Error(
      "Một video đang được xử lý. Hãy chờ hoàn tất hoặc kiểm tra lịch sử.",
    );
  if (r === "BUDGET") throw new Error("Đã chạm hạn mức chi phí trong ngày.");
  return r;
}
export async function releaseSlot(id: string) {
  await db().eval(
    `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`,
    [key("active")],
    [id],
  );
}
// Auxiliary paid steps reserve a conservative upper bound before the external call.
// Reservations are intentionally not refunded without confirmed provider billing data.
export async function reserveAux(usd: number) {
  const c = configuration();
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const k = key("budget:" + day);
  const ok = await db().eval<unknown[], number>(
    `local u=tonumber(redis.call('GET',KEYS[1]) or '0');if u+tonumber(ARGV[1])>tonumber(ARGV[2]) then return 0 end;redis.call('INCRBY',KEYS[1],ARGV[1]);redis.call('EXPIRE',KEYS[1],172800);return 1`,
    [k],
    [Math.ceil(usd * 1e6), Math.floor(c.dailyBudgetUsd * 1e6)],
  );
  if (!ok) throw new Error("Chi phí chuẩn bị vượt hạn mức ngày.");
}
