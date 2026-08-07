export async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some content-script contexts expose Clipboard API but reject writes.
    }
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText = "position: fixed; left: -9999px; top: 0;";
  document.body.appendChild(el);
  el.select();
  const copied = document.execCommand("copy");
  el.remove();
  if (!copied) throw new Error("copy failed");
}
