import { sleep } from "workflow";
import {
  prepare,
  submitSegment,
  pollSegment,
  merge,
  finishFailed,
} from "./steps";
export async function createVideo(id: string) {
  "use workflow";
  console.log("video workflow", id);
  try {
    const count = await prepare(id);
    for (let i = 0; i < count; i++) {
      await submitSegment(id, i);
      let done = false;
      for (let attempt = 0; attempt < 180; attempt++) {
        if (await pollSegment(id, i)) {
          done = true;
          break;
        }
        await sleep("30s");
      }
      if (!done)
        throw new Error(
          "Phosor xử lý lâu hơn 90 phút. Giữ request_id để đối chiếu; không gửi tạo lại.",
        );
    }
    await merge(id);
  } catch (error) {
    await finishFailed(
      id,
      error instanceof Error ? error.message : "Xử lý chưa hoàn tất.",
    );
  }
}
