import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { passTool } from "./pass";

describe("pass tool", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns acknowledgment and logs reason when provided", async () => {
    const result = await passTool.handler({ reason: "Private conversation" }, {});

    expect(passTool.name).toBe("pass");
    expect(passTool.description).toContain("do nothing");
    expect(result).toHaveProperty("content");
    expect(result.content).toEqual([
      { type: "text", text: "Acknowledged - no action taken." },
    ]);
    expect(consoleSpy).toHaveBeenCalledWith("[pass] Private conversation");
  });

  it("handles missing or empty reason", async () => {
    const resultUndefined = await passTool.handler({}, {});
    const resultEmpty = await passTool.handler({ reason: "" }, {});
    const resultWhitespace = await passTool.handler({ reason: "  " }, {});

    expect(resultUndefined.content).toEqual([
      { type: "text", text: "Acknowledged - no action taken." },
    ]);
    expect(resultEmpty.content).toEqual([
      { type: "text", text: "Acknowledged - no action taken." },
    ]);
    expect(resultWhitespace.content).toEqual([
      { type: "text", text: "Acknowledged - no action taken." },
    ]);

    expect(consoleSpy).toHaveBeenCalledWith("[pass] No reason given");
    expect(consoleSpy).toHaveBeenCalledTimes(3);
  });

  it("has optional reason parameter", () => {
    expect(passTool.inputSchema.reason).toBeDefined();
  });
});
