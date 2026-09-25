"use server";

import { headers } from "next/headers";
import { currentSessionHash, requireUser } from "@/server/auth/session";
import { run, type ActionState } from "@/server/action-utils";
import { removePushSubscription, savePushSubscription } from "@/server/services/push";

export async function subscribePushAction(subscription: unknown): Promise<ActionState> {
  return run(async () => {
    const ua = (await headers()).get("user-agent");
    await savePushSubscription(await requireUser(), await currentSessionHash(), subscription, ua);
    return "Notifications are on for this device.";
  });
}

export async function unsubscribePushAction(endpoint: string): Promise<ActionState> {
  return run(async () => {
    await removePushSubscription(await requireUser(), endpoint);
    return "Notifications are off for this device.";
  });
}
