import { get, put } from "@vercel/blob";
export async function readPrivate(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200)
    throw new Error("Tệp lưu trữ không còn khả dụng.");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}
export async function writePrivate(path: string, data: Buffer, mime: string) {
  const b = await put(path, data, {
    access: "private",
    contentType: mime,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return b.pathname;
}
