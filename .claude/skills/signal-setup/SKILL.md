---
name: signal-setup
description: This skill should be used when the user asks to "register a phone number with Signal", "set up signal-cli", "verify Signal registration", "troubleshoot Signal registration", "fix user not registered error", or mentions needing to register a new phone number for the bot.
---

# Signal Setup

Guide for registering and configuring phone numbers with signal-cli for the Signal AI Assistant.

## Overview

Signal registration is a one-time setup process that creates the cryptographic identity for a phone number. The registration data is stored in the `signal-cli-config/` directory and must be preserved - losing this data requires re-registration.

## Prerequisites

- **signal-cli** installed (macOS: `brew install signal-cli`, or download from GitHub releases)
- **Java 21+** (required by signal-cli 0.13.2+)
- A dedicated phone number capable of receiving SMS
- Note: Most VoIP numbers do not work with Signal

## Registration Process

### Step 1: Obtain CAPTCHA Token

1. Open https://signalcaptchas.org/registration/generate.html in a browser
2. Complete the CAPTCHA challenge
3. Open browser DevTools (F12) → Network tab
4. Look for a request starting with `signalcaptcha://`
5. Copy the full token (format: `signalcaptcha://signal-hcaptcha.LONG_TOKEN_STRING`)

**Important:** Tokens expire quickly. Proceed to Step 2 immediately after obtaining the token.

### Step 2: Register Phone Number

```bash
signal-cli -c ./signal-cli-config -a +1234567890 register --captcha 'signalcaptcha://signal-hcaptcha.TOKEN_HERE'
```

Replace `+1234567890` with the actual phone number in E.164 format.

**Success indicator:** Command completes with no output. An SMS verification code will be sent to the phone.

### Step 3: Verify with SMS Code

```bash
signal-cli -c ./signal-cli-config -a +1234567890 verify 123456
```

Replace `123456` with the 6-digit code from the SMS.

**Success indicator:** Command completes with no output.

### Step 4: Set Profile Name

```bash
signal-cli -c ./signal-cli-config -a +1234567890 updateProfile --given-name "AgentName"
```

This sets the display name other Signal users will see.

## Troubleshooting

### "User not registered" Error

The registration process did not complete. Common causes:
- CAPTCHA token expired before registration command ran
- Network issues during registration
- Phone number already registered on another device

**Fix:** Start fresh from Step 1 with a new CAPTCHA token.

### No SMS Received

Some phone numbers cannot receive Signal verification SMS. Try voice verification:

```bash
signal-cli -c ./signal-cli-config -a +1234567890 register --captcha 'TOKEN' --voice
```

**Note:** Voice verification only works after an SMS attempt has been made. Signal requires trying SMS first.

### CAPTCHA Token Rejected

Tokens have a very short lifespan. Solutions:
- Get a fresh token and run the register command within 30 seconds
- Ensure the full token is copied, including the `signalcaptcha://` prefix
- Check for any trailing whitespace or line breaks

### Rate Limited

Signal rate-limits registration attempts. If rate limited:
- Wait several hours before retrying
- Avoid repeated failed attempts as this extends the cooldown

### Java Version Mismatch

Error: `class file version 65.0 ... this is Java 21`

signal-cli 0.13.2+ requires Java 21. Check version:
```bash
java -version
```

On macOS, install via Homebrew:
```bash
brew install openjdk@21
```

## Configuration Directory Structure

After successful registration, the config directory contains:

```
signal-cli-config/
└── data/
    ├── accounts.json          # Account metadata
    └── {account-id}/          # Per-account data
        ├── identity-key       # Cryptographic identity
        ├── sessions/          # Session keys with contacts
        └── ...
```

**Critical:** Back up this directory. Losing it requires re-registration and may cause message delivery issues with existing contacts.

## Docker Considerations

When running in Docker, mount the signal-cli config from the host:

```yaml
volumes:
  - ./data/signal-cli:/home/jarvis/data/signal-cli
```

Ensure the `SIGNAL_CLI_CONFIG` environment variable points to the mounted path inside the container.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGENT_PHONE_NUMBER` | Yes | - | E.164 format phone number |
| `SIGNAL_CLI_CONFIG` | No | `./signal-cli-config` | Path to signal-cli data |

## Quick Reference

```bash
# Register (get CAPTCHA first)
signal-cli -c ./signal-cli-config -a +1234567890 register --captcha 'TOKEN'

# Verify SMS code
signal-cli -c ./signal-cli-config -a +1234567890 verify 123456

# Set profile name
signal-cli -c ./signal-cli-config -a +1234567890 updateProfile --given-name "Name"

# Test sending a message
signal-cli -c ./signal-cli-config -a +1234567890 send -m "Hello" +0987654321

# List registered accounts
cat ./signal-cli-config/data/accounts.json
```
