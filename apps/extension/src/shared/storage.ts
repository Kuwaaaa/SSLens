// Typed wrappers over chrome.storage.local for token, identity, and
// reading mode. Keys are exported so listeners (content scripts, popup)
// can subscribe to changes via chrome.storage.onChanged.

import type { ReadingMode } from "@lumen/schema";

export const KEY_TOKEN = "lumen.token";
export const KEY_USER = "lumen.user";
export const KEY_READING_MODE = "lumen.readingMode";
export const KEY_HIDDEN_SITES = "lumen.hiddenSites";

export interface StoredUser {
  userId: string;
  handle: string;
}

export async function getToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(KEY_TOKEN);
  return (r[KEY_TOKEN] as string | undefined) ?? null;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_TOKEN]: token });
}

export async function getUser(): Promise<StoredUser | null> {
  const r = await chrome.storage.local.get(KEY_USER);
  return (r[KEY_USER] as StoredUser | undefined) ?? null;
}

export async function setUser(user: StoredUser): Promise<void> {
  await chrome.storage.local.set({ [KEY_USER]: user });
}

export async function logout(): Promise<void> {
  await chrome.storage.local.remove([KEY_TOKEN, KEY_USER]);
}

export async function getReadingMode(): Promise<ReadingMode> {
  const r = await chrome.storage.local.get(KEY_READING_MODE);
  return (r[KEY_READING_MODE] as ReadingMode | undefined) ?? "quiet";
}

export async function setReadingMode(mode: ReadingMode): Promise<void> {
  await chrome.storage.local.set({ [KEY_READING_MODE]: mode });
}

export async function getSiteHidden(host: string): Promise<boolean> {
  const key = normalizeHost(host);
  if (!key) return false;
  const r = await chrome.storage.local.get(KEY_HIDDEN_SITES);
  const hidden = (r[KEY_HIDDEN_SITES] as Record<string, boolean> | undefined) ?? {};
  return hidden[key] === true;
}

export async function setSiteHidden(host: string, value: boolean): Promise<void> {
  const key = normalizeHost(host);
  if (!key) return;
  const r = await chrome.storage.local.get(KEY_HIDDEN_SITES);
  const hidden = { ...((r[KEY_HIDDEN_SITES] as Record<string, boolean> | undefined) ?? {}) };
  if (value) hidden[key] = true;
  else delete hidden[key];
  await chrome.storage.local.set({ [KEY_HIDDEN_SITES]: hidden });
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}
