import { handleSendConnectionRequestPost } from "@/lib/server/connectionRequestRoute";

export async function POST(request: Request) {
  return handleSendConnectionRequestPost(request);
}
