export function redisCredentials() {
  // Vercel integrations can expose the same Redis REST credentials under KV_*.
  const primary = {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  const alias = {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  };
  if (primary.url && primary.token) return primary;
  if (alias.url && alias.token) return alias;
  // Never combine credentials belonging to different Redis connections.
  return primary.url || primary.token ? primary : alias;
}

export function storageReadiness() {
  const { url, token } = redisCredentials();
  const missing: string[] = [];
  if (!process.env.BLOB_READ_WRITE_TOKEN) missing.push("BLOB_READ_WRITE_TOKEN");
  if (!url) missing.push("UPSTASH_REDIS_REST_URL (hoặc KV_REST_API_URL)");
  if (!token) missing.push("UPSTASH_REDIS_REST_TOKEN (hoặc KV_REST_API_TOKEN)");
  return { ready: missing.length === 0, missing };
}

export function requireStorage() {
  const state = storageReadiness();
  if (!state.ready) {
    throw new Error(
      `Chưa lưu được ảnh: còn thiếu cấu hình ${state.missing.join(", ")}. Thêm trong Vercel rồi Redeploy.`,
    );
  }
}
