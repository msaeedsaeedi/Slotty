/** Web Push is on when VAPID keys are configured (see .env.example). */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;
