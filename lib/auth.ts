import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { configuration } from "./config";
export const COOKIE = "phosor_session";
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function passwordOK(p: string) {
  return !!process.env.APP_PASSWORD && equal(p, process.env.APP_PASSWORD);
}
function sign(v: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(v)
    .digest("hex");
}
export function sessionToken() {
  const exp = String(Date.now() + 7 * 86400000);
  return `${exp}.${sign(exp)}`;
}
export function authenticated(req: NextRequest) {
  if (!configuration().access) return false;
  const token = req.cookies.get(COOKIE)?.value || "";
  const [exp, sig] = token.split(".");
  return Number(exp) > Date.now() && !!sig && equal(sign(exp), sig);
}
export function requireAuth(req: NextRequest) {
  if (!authenticated(req))
    throw new Error("Vui lòng đăng nhập bằng mật khẩu cá nhân.");
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin)
    throw new Error("Yêu cầu không cùng nguồn bị từ chối.");
}
