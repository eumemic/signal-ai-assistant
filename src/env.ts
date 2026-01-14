import dotenv from "dotenv";

dotenv.config();

interface Env {
  agentName: string;
  agentPhoneNumber: string;
  signalCliRestApiUrl: string;
  openAIApiKey: string;
  openAIModel: string;
}

let env: Env | undefined;

export function getEnv(): Env {
  if (env) return env;

  env = {
    agentName: required("AGENT_NAME"),
    agentPhoneNumber: required("AGENT_PHONE_NUMBER"),
    signalCliRestApiUrl:
      optional("SIGNAL_CLI_REST_API_URL") || "http://localhost:8080",
    openAIApiKey: required("OPENAI_API_KEY"),
    openAIModel: optional("OPENAI_MODEL") || "gpt-3.5-turbo",
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
