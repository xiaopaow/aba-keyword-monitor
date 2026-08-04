"use client";

const DEVICE_STORAGE_KEY = "aba_member_device_id";

export async function getDeviceFingerprint() {
  const deviceId = getOrCreateDeviceId();
  return buildStableDeviceFingerprint(deviceId);
}

export async function getLegacyDeviceFingerprint() {
  return buildLegacyFallbackFingerprint(getLegacyEnvironmentText(), getOrCreateDeviceId());
}

export async function getLegacyDeviceFingerprints() {
  const deviceId = getOrCreateDeviceId();
  const legacyEnvironmentText = getLegacyEnvironmentText();
  const fingerprints = [
    buildLegacyFallbackV2Fingerprint(deviceId),
    await buildLegacyCryptoV2Fingerprint(deviceId),
    buildLegacyFallbackFingerprint(legacyEnvironmentText, deviceId),
    await buildLegacyCryptoFingerprint(legacyEnvironmentText)
  ];
  return Array.from(new Set(fingerprints.filter(Boolean)));
}

function getLegacyEnvironmentText() {
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
  return parts.join("|");
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (existing) {
    persistDeviceId(existing);
    return existing;
  }
  const cookieValue = readDeviceCookie();
  if (cookieValue) {
    persistDeviceId(cookieValue);
    return cookieValue;
  }
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  persistDeviceId(next);
  return next;
}

function persistDeviceId(deviceId: string) {
  localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  document.cookie = `${DEVICE_STORAGE_KEY}=${encodeURIComponent(deviceId)}; Max-Age=${60 * 60 * 24 * 365 * 5}; Path=/; SameSite=Lax`;
}

function readDeviceCookie() {
  for (const part of document.cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === DEVICE_STORAGE_KEY) return decodeURIComponent(value.join("="));
  }
  return "";
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

function buildStableDeviceFingerprint(deviceId: string) {
  return `v3_${stableHash(deviceId)}`;
}

function buildLegacyFallbackV2Fingerprint(deviceId: string) {
  return `v2_${buildLegacyFallbackFingerprint(deviceId, deviceId)}`;
}

async function buildLegacyCryptoV2Fingerprint(deviceId: string) {
  const digest = await buildLegacyCryptoFingerprint(deviceId);
  return digest ? `v2_${digest}` : "";
}

async function buildLegacyCryptoFingerprint(input: string) {
  if (crypto?.subtle) {
    try {
      const data = new TextEncoder().encode(input);
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return "";
    }
  }
  return "";
}

function buildLegacyFallbackFingerprint(input: string, deviceId: string) {
  const safeDeviceId = deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  return `fp_${fnvHex(input)}_${safeDeviceId}`;
}

function stableHash(input: string) {
  return fnvHex(input).padStart(8, "0");
}

function fnvHex(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
