import { positiveNumber } from "./policy";
export function configuration() {
  const storage = !!(
    process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
  const access = !!(
    process.env.APP_PASSWORD &&
    process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32
  );
  const spend =
    process.env.GENERATION_ENABLED === "true" &&
    positiveNumber(process.env.DAILY_BUDGET_USD) > 0 &&
    positiveNumber(process.env.MAX_JOB_USD) > 0;
  return {
    access,
    storage,
    phosor: !!process.env.PHOSOR_API_KEY,
    script: !!process.env.DEEPSEEK_API_KEY,
    voice: !!process.env.GOOGLE_TTS_API_KEY,
    spend,
    ready: access && storage && !!process.env.PHOSOR_API_KEY && spend,
    dailyBudgetUsd: positiveNumber(process.env.DAILY_BUDGET_USD),
    maxJobUsd: positiveNumber(process.env.MAX_JOB_USD),
    infraUsd: positiveNumber(process.env.INFRA_ESTIMATE_USD, 0.01),
    fx: positiveNumber(process.env.USD_VND, 26000),
  };
}
export function requireGeneration() {
  if (!configuration().ready)
    throw new Error(
      "Chưa mở tạo video: cần cấu hình bảo vệ, lưu trữ, khóa Phosor và hạn mức chi phí.",
    );
}
