import { describe, expect, test } from "bun:test";

import { applyThemeAttributes, setThemeHostElement } from "./theme-host";

describe("theme-host", () => {
  test("applies theme and mode attributes to the current host", () => {
    const host = { dataset: {} } as HTMLElement;
    setThemeHostElement(host);

    applyThemeAttributes("signal", "thinking");
    expect(host.dataset.lumenTheme).toBe("signal");
    expect(host.dataset.lumenMode).toBe("thinking");

    applyThemeAttributes("classic");
    expect(host.dataset.lumenTheme).toBe("classic");
    expect(host.dataset.lumenMode).toBe("thinking");
  });
});
