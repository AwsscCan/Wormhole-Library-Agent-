import { guardAuthRequest } from "@/lib/auth/rateLimit";
import { getAuth } from "@/lib/auth/server";

async function handle(request: Request): Promise<Response> {
  const rejected = await guardAuthRequest(request);
  if (rejected) return rejected;

  const response = await getAuth(request).handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = handle;
export const POST = handle;
