export function scrollRangeIntoView(range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    window.scrollBy({
      top: rect.top - window.innerHeight * 0.35,
      behavior: "smooth",
    });
    return;
  }

  const node = range.startContainer;
  const el = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
}
