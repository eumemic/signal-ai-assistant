import dotenv from "dotenv";

dotenv.config();

interface Env {
  agentName: string;
  agentPhoneNumber: string;
  anthropicApiKey: string;
  anthropicModel: string;
}

let env: Env | undefined;

export function getEnv(): Env {
  if (env) {
    return env;
  }

  env = {
    agentName: required("AGENT_NAME"),
    agentPhoneNumber: required("AGENT_PHONE_NUMBER"),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    anthropicModel: optional("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20250514",
  };

  return env;

  function required(key: string): string {
    const value = optional(key);
    if (value === undefined) {
      throw new Error(`${key} must be specified`);
    }
    return value;
  }

  function optional(key: string): string | undefined {
    return process.env[key];
  }
}
