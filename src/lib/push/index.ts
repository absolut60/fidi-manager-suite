import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BIsQa2DWlUoauNrZXyOKunz612I1N-CSbbG7UBd6liE18Glu3Z4YLdAw6gjY4sKkY2pDGs9V1D0osAzuWhjo-lk";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isPushSupported(): boolean {
  if (!isBrowser()) return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function detectPlatform(): "ios" | "android" | "desktop" | null {
  if (!isBrowser() || !navigator.userAgent) return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function isStandalone(): boolean {
  if (!isBrowser()) return false;
  const nav = window.navigator as typeof window.navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  return registration;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isThisDeviceSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    if (Notification.permission !== "granted") return false;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function getNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isBrowser() || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function currentPlatform(): "ios" | "android" | "desktop" {
  return detectPlatform() ?? "desktop";
}


export async function subscribeToPush(
  userId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, reason: perm };
  }

  const reg = await registerServiceWorker();
  if (!reg) {
    return { ok: false, reason: "no-sw" };
  }

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe();
    sub = null;
  }

  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      .buffer as ArrayBuffer,
  });

  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: "invalid-subscription" };
  }

  const platform = currentPlatform();

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform)
    .neq("endpoint", endpoint);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      platform,
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isBrowser() || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
      await sub.unsubscribe();
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("platform", currentPlatform());
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeDeviceSubscription(
  id: string,
  endpoint: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!isBrowser()) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    await supabase.from("push_subscriptions").delete().eq("id", id);

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub && sub.endpoint === endpoint) {
        await sub.unsubscribe();
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
