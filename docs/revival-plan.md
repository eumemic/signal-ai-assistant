# Revival + Upgrade Plan

## Snapshot of the current codebase

- `src/main.ts` polls the Signal REST bridge every second and routes events into `Chat` instances, which orchestrate message batching and responses.
- `src/chat.ts` holds the conversation logic. It still uses `langchain@0.0.64`'s `ConversationChain` + `ChatOpenAI` and assumes the legacy monorepo import paths.
- `src/signal-api.ts` wraps the REST bridge using `fetch` (now the built-in global) and expects synchronous polling.
- Tests only cover the `TaskQueue`, but a Vitest harness is now available.

## LangChain + OpenAI modernization roadmap

1. **Upgrade dependencies**
   - Replace the monolithic `langchain` package with the split modules introduced in 0.1+: `@langchain/core`, `@langchain/openai`, and (optionally) `@langchain/community` if you add community integrations.
   - Introduce `zod` for schema validation if you plan to use tool calling or structured outputs.
   - Update the OpenAI client dependency if you want direct SDK access in parallel with LangChain.

2. **Refactor `Chat` pipeline** (`src/chat.ts`)
   - Swap `ConversationChain` for the modern `RunnableSequence` pattern: `prompt.pipe(model).pipe(parser)`.
   - Use `ChatOpenAI` from `@langchain/openai`; the constructor signature changed (`model` instead of `modelName`, `apiKey` instead of `openAIApiKey`).
   - Consider using streaming (`.stream(...)`) to send partial replies back to Signal for long-form outputs.

3. **Memory + persistence**
   - `BufferMemory` is still supported but consider `InMemoryChatMessageHistory` from `@langchain/core/chat_history` or a persistent backend (e.g., Redis, Supabase) to recover state after restarts.
   - Store per-chat memory externally so that restarting the process does not forget prior context.

4. **Tool + function calling**
   - LangChain ≥0.1 exposes tool calling primitives via `RunnableWithMessageHistory` and `model.bindTools(...)`. You can expose Signal-specific utilities (send attachment, look up group metadata) to the LLM safely.
   - Add guards so the assistant responds only when @-mentioned or when the conversation history indicates a direct question.

5. **Testing the chain**
   - Add unit tests for `Chat.processEvents` using Vitest's fake timers to simulate queued Signal messages.
   - Snapshot-test the LangChain prompt to ensure future edits keep the guardrails (e.g., disallowed phrases) intact.

6. **Observability + rate limits**
   - Introduce structured logging (Pino or console JSON) and expose metrics for Signal polling latency, OpenAI latency, and error rates.
   - Set OpenAI `maxTokens` and `timeout` defaults via env vars to avoid runaway costs.

## Broader revival checklist

- **Signal bridge**: the [`signal-cli-rest-api`](https://github.com/bbernhard/signal-cli-rest-api) project has moved; ensure you are pinned to a maintained fork and that your config (`signal-cli-config`) still works with current Signal updates.
- **Containerization**: add a Dockerfile + compose stack that runs the Signal bridge + assistant together using health checks.
- **Secrets management**: move `.env` loading to something like Doppler, 1Password Connect, or AWS Secrets Manager in production deployments.
- **CI/CD**: add GitHub Actions for `npm run build`, `npm test`, and linting. Cache the Signal mock/test fixtures so CI stays deterministic.
- **Documentation**: expand `README.md` with troubleshooting steps (link issues, known limitations) and architecture diagrams so new maintainers can onboard quickly.

Keeping this checklist in `docs/revival-plan.md` lets you mark progress as you modernize each area.
