# Signal AI Assistant

Signal AI Assistant integrates with large language models (LLMs) using [LangChain.js](https://github.com/hwchase17/langchainjs) and the [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) project to create an AI-powered personal assistant within the Signal messaging app.

## Overview

The Signal AI Assistant project aims to leverage the capabilities of modern LLMs and the secure and private nature of Signal to provide users with an AI assistant that can perform tasks, answer questions, and provide useful information on demand.

## Prerequisites

- A Signal account and phone number
- Access to the OpenAI API
- Docker (for running the `signal-cli-rest-api`)
- Node.js 20+ (recommended)

## Installation

1. Clone the Signal AI Assistant repository:

   ```
   git clone https://github.com/yourusername/signal-ai-assistant.git
   cd signal-ai-assistant
   ```

2. Install the dependencies:

   ```
   npm install
   ```

3. Set up the [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) by following the instructions in its README.

4. Create a `.env` file in the root directory and add the necessary environment variables:

   ```
   AGENT_NAME=... # the name attached to your signal account
   AGENT_PHONE_NUMBER=... # the phone number attached to your signal account
   SIGNAL_CLI_REST_API_URL=... # optional, defaults to http://localhost:8080
   OPENAI_API_KEY=... # your OpenAI API key (https://platform.openai.com/account/api-keys)
   OPENAI_MODEL=... # optional, defaults to gpt-5.2
   ```

5. Build and start the Signal AI Assistant:

   ```
   npm run build
   npm start
   # Or run directly with ts-node during development:
   npm run dev
   ```

## Testing

Unit tests use Vitest:

```
npm test
```

## Usage

To interact with your Signal AI Assistant, simply send a message to the phone number associated with your assistan'ts Signal account. You can also add the assistant to group chats--in group chats, the assistant will only respond if it's @-mentioned.

## License

Signal AI Assistant is released under the [MIT License](LICENSE).
