import dotenv from "dotenv";

dotenv.config();

interface Env {
  openAIApiKey: string;
  serpApiApiKey?: string;
  agentName: string;
  agentPhoneNumber: string;
}

let env: Env | undefined;

export function getEnv(): Env {
  if (env) return env;

  env = {
    openAIApiKey: required("OPENAI_API_KEY"),
    serpApiApiKey: optional("SERPAPI_API_KEY"),
    agentName: optional("AGENT_NAME") || "Jarvis",
    agentPhoneNumber: required("AGENT_PHONE_NUMBER"),
  };

  return env;

  function required(key: string): string {
    const value = optional(key);
    if (value === undefined) throw Error(`${key} must be specified in .env!`);
    return value;
  }

  function optional(key: string): string | undefined {
    return process.env[key];
  }
}
