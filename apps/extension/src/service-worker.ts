// Minimal MV3 service worker.
//
// MVP NOTE: the WebSocket lives in content scripts, not here. This SW exists
// so the extension has a background entrypoint and can surface install events
// in the future. See apps/extension/README.md for the architecture deviation.

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[Lumen] installed:", details.reason);
});
