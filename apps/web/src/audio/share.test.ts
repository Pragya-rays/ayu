import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrCopy } from "./share";

const stubNavigator = (share: unknown, writeText = vi.fn(async () => undefined)) => {
  vi.stubGlobal("navigator", { share, clipboard: { writeText } });
  return writeText;
};

afterEach(() => vi.unstubAllGlobals());

describe("shareOrCopy", () => {
  it("uses the share sheet when it works", async () => {
    const writeText = stubNavigator(vi.fn(async () => undefined));
    expect(await shareOrCopy("x")).toBe("shared");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does nothing when the person closes the sheet", async () => {
    const writeText = stubNavigator(vi.fn(async () => {
      throw new DOMException("closed", "AbortError");
    }));
    expect(await shareOrCopy("x")).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies when sharing fails or is missing", async () => {
    const failing = stubNavigator(vi.fn(async () => {
      throw new DOMException("no", "NotAllowedError");
    }));
    expect(await shareOrCopy("x")).toBe("copied");
    expect(failing).toHaveBeenCalledWith("x");
    stubNavigator(undefined);
    expect(await shareOrCopy("x")).toBe("copied");
  });

  it("reports failure when nothing works", async () => {
    stubNavigator(undefined, vi.fn(async () => {
      throw new Error("blocked");
    }));
    expect(await shareOrCopy("x")).toBe("failed");
  });
});
