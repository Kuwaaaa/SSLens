export function isInsideLumenOverlay(target: EventTarget | null): boolean {
  const node = target as Node | null;
  return !!node && !!(node as Element).closest?.("#lumen-root, [data-lumen-overlay]");
}
