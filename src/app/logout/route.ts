import { destroySession } from "@/server/auth/session";

/**
 * Sign out. A route handler (not a Server Action) so the response can carry
 * Clear-Site-Data: pages saved for offline use and the service worker are wiped
 * on shared computers. Ending the session also removes this device's push
 * subscription (it's tied to the session).
 */
export async function POST(req: Request) {
  await destroySession();
  return new Response(null, {
    status: 303,
    headers: { Location: new URL("/login", req.url).toString(), "Clear-Site-Data": '"cache", "storage"' },
  });
}
