import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("env", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Reset the internal env cache before each test
    const { _resetEnvForTesting } = await import("./env");
    _resetEnvForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns anthropicApiKey from ANTHROPIC_API_KEY", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.anthropicApiKey).toBe("test-anthropic-key");
  });

  it("returns anthropicModel with default value", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.anthropicModel).toBe("claude-sonnet-4-5-20250929");
  });

  it("allows overriding anthropicModel via ANTHROPIC_MODEL", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.ANTHROPIC_MODEL = "claude-opus-4-5-20251101";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.anthropicModel).toBe("claude-opus-4-5-20251101");
  });

  it("returns agentName and agentPhoneNumber", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "Jarvis";
    process.env.AGENT_PHONE_NUMBER = "+12025551234";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.agentName).toBe("Jarvis");
    expect(env.agentPhoneNumber).toBe("+12025551234");
  });

  it("throws when ANTHROPIC_API_KEY is missing", async () => {
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";
    delete process.env.ANTHROPIC_API_KEY;

    const { getEnv } = await import("./env");

    expect(() => getEnv()).toThrow("ANTHROPIC_API_KEY must be specified");
  });

  it("does not include openAIApiKey property", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env).not.toHaveProperty("openAIApiKey");
  });

  it("does not include openAIModel property", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env).not.toHaveProperty("openAIModel");
  });

  it("does not include signalCliRestApiUrl property", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env).not.toHaveProperty("signalCliRestApiUrl");
  });

  it("returns exactly the expected shape", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "Jarvis";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(Object.keys(env).sort()).toEqual([
      "agentName",
      "agentPhoneNumber",
      "anthropicApiKey",
      "anthropicModel",
      "groupBehaviorInDms",
      "signalCliConfig",
    ]);
  });

  it("returns signalCliConfig with default value", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    // Default is resolved to absolute path from ./signal-cli-config
    expect(env.signalCliConfig).toContain("signal-cli-config");
  });

  it("returns groupBehaviorInDms as false by default", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.groupBehaviorInDms).toBe(false);
  });

  it("returns groupBehaviorInDms as true when set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.AGENT_NAME = "TestAgent";
    process.env.AGENT_PHONE_NUMBER = "+15555555555";
    process.env.GROUP_BEHAVIOR_IN_DMS = "true";

    const { getEnv } = await import("./env");
    const env = getEnv();

    expect(env.groupBehaviorInDms).toBe(true);
  });
});
