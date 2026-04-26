// Typed wrappers over chrome.storage.local for token + user identity.

const KEY_TOKEN = "lumen.token";
const KEY_USER = "lumen.user";

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
