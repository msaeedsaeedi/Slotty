/** Web Push is on when VAPID keys are configured (see .env.example). */
export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export const vapidPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
