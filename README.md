# Signal AI Assistant

A Signal messaging bot powered by Claude (Anthropic) that acts as an AI-powered personal assistant. Uses native `signal-cli` for Signal protocol communication.

## Prerequisites

- Node.js 22+
- Java 21+ (required by signal-cli 0.13.2+)
- A dedicated phone number for the bot (VoIP numbers usually don't work)
- Anthropic API key

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/signal-ai-assistant.git
   cd signal-ai-assistant
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Install signal-cli (macOS):

   ```bash
   brew install signal-cli
   ```

   Or download from [signal-cli releases](https://github.com/AsamK/signal-cli/releases).

4. Create a `.env` file:

   ```bash
   AGENT_NAME=Jarvis              # Display name for the bot
   AGENT_PHONE_NUMBER=+1234567890 # Phone number in E.164 format
   ANTHROPIC_API_KEY=sk-ant-...   # Your Anthropic API key

   # Optional
   ANTHROPIC_MODEL=claude-haiku-4-5  # Defaults to claude-haiku-4-5
   SIGNAL_CLI_CONFIG=./data/signal-cli-config  # Defaults to ./data/signal-cli-config
   ```

## Signal Registration

Register your phone number with Signal before running the bot. This is a one-time setup.

### Step 1: Get a CAPTCHA token

1. Open https://signalcaptchas.org/registration/generate.html in your browser
2. Complete the CAPTCHA challenge
3. Open browser DevTools (F12) → Network tab
4. Look for a request to `signalcaptcha://` - copy the full token (starts with `signalcaptcha://signal-hcaptcha.`)

### Step 2: Register the phone number

```bash
signal-cli -c ./data/signal-cli-config -a +1234567890 register --captcha 'signalcaptcha://signal-hcaptcha.YOUR_TOKEN_HERE'
```

If successful, the command completes with no output. You'll receive an SMS verification code.

### Step 3: Verify with SMS code

```bash
signal-cli -c ./data/signal-cli-config -a +1234567890 verify 123456
```

Replace `123456` with the code from the SMS.

### Step 4: Set the profile name

```bash
signal-cli -c ./data/signal-cli-config -a +1234567890 updateProfile --given-name "Jarvis"
```

### Troubleshooting Registration

**"User not registered"** - The registration didn't complete. Start from Step 1.

**No SMS received** - Some VoIP numbers don't receive Signal SMS. Try voice verification:
```bash
signal-cli -c ./data/signal-cli-config -a +1234567890 register --captcha 'TOKEN' --voice
```
Note: Voice verification only works after a failed SMS attempt.

**CAPTCHA expired** - Tokens expire quickly. Get a fresh one and retry immediately.

**Rate limited** - Wait a few hours before retrying registration.

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

```bash
# Build and run
docker compose up --build

# View logs
docker compose logs -f
```

For Docker, the `./data/` directory is mounted and contains both signal-cli registration and session data.

## Usage

- **Direct messages**: Send any message to the bot's phone number
- **Group chats**: Add the bot to a group and @-mention it to get a response

## Testing

```bash
npm test
```

## License

MIT License
