import { getCurrentUser } from "@/server/auth/session";
import { handleDraftUpload } from "@/server/draft-upload-handler";

export const dynamic = "force-dynamic";

/** Marking drafts from the open sheet and the service worker (#163): see `handleDraftUpload`. */
export function POST(request: Request) {
  return handleDraftUpload(request, getCurrentUser);
}
