"use client";

const DEVICE_STORAGE_KEY = "aba_member_device_id";

export async function getDeviceFingerprint() {
  const deviceId = getOrCreateDeviceId();
  const parts = [
    deviceId,
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    getCanvasSignature()
  ];
  return hashText(parts.join("|"));
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_STORAGE_KEY, next);
  return next;
}

function getCanvasSignature() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 40;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.textBaseline = "top";
    context.font = "16px Arial";
    context.fillStyle = "#123456";
    context.fillText("ABA device check", 2, 6);
    return canvas.toDataURL().slice(-120);
  } catch {
    return "";
  }
}

async function hashText(input: string) {
  if (crypto?.subtle) {
    try {
      const data = new TextEncoder().encode(input);
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // LAN HTTP is not always a secure context. Fall back to a lightweight non-crypto hash.
    }
  }

  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16)}_${getOrCreateDeviceId().replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;
}
