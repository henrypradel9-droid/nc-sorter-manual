import { timingSafeEqual } from "node:crypto";
import { runEmailJob } from "@/lib/cloud-email";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || authorization.length !== expected.length || !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))) {
    return Response.json({error:"Unauthorized"}, {status:401});
  }
  try {
    const mode = new URL(request.url).searchParams.get("mode") === "test" ? "test" : "scheduled";
    return Response.json(await runEmailJob(mode));
  } catch (error) {
    console.error("NC_SORTER_EMAIL_FAILED", error instanceof Error ? error.message : "unknown");
    return Response.json({error:"Email job failed; inspect delivery state before retrying"}, {status:500});
  }
}
