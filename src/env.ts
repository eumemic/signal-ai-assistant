import dotenv from "dotenv";
import path from "path";

dotenv.config();

interface Env {
  agentName: string;
  agentPhoneNumber: string;
  anthropicApiKey: string;
  anthropicModel: string;
  signalCliConfig?: string;
  groupBehaviorInDms: boolean;
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
    anthropicModel: optional("ANTHROPIC_MODEL") || "claude-sonnet-4-5-20250929",
    signalCliConfig: path.resolve(optional("SIGNAL_CLI_CONFIG") || "./signal-cli-config"),
    groupBehaviorInDms: optional("GROUP_BEHAVIOR_IN_DMS") === "true",
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
