# 🙏 Nullclaw-Whatsapp — Kaippulli Temple AI Assistant

AI-powered WhatsApp assistant for **Kaippulli Temple**. Devotees can message the bot number for information about darshan timings, festivals, rituals, directions, and spiritual guidance.

## Features

- WhatsApp connection via [Baileys](https://github.com/adiwajshing/Baileys) (no WhatsApp Business API needed)
- AI responses powered by OpenAI-compatible LLM (`gemini/gemini-2.0-flash-lite`)
- Multi-language support: Malayalam, English, Kannada, Tamil, Hindi
- Multi-turn conversation memory (context-aware replies)
- Streaming AI responses with typing indicators
- `/reset` and `/help` commands
- Ready for Coolify deployment

## Deployment on Coolify

### 1. Push this repo to GitHub

```bash
git init
git remote add origin https://github.com/Babuperumana/Nullclaw-with-Whatsapp.git
git add .
git commit -m "Initial commit: Kaippulli Temple AI Assistant"
git push -u origin main
```

### 2. Create Application in Coolify

1. **New Application** → **Dockerfile** → Paste your GitHub repo URL
2. **Port**: `3000`
3. **Environment Variables** (set in Coolify dashboard):

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your API key |
| `OPENAI_BASE_URL` | `https://omni.kaippulli.sbs/v1` |
| `OPENAI_MODEL` | `gemini/gemini-2.0-flash-lite` |
| `WHATSAPP_OWNER_NUMBER` | Your number (e.g. `919XXXXXXXXXX`) — optional |
| `PORT` | `3000` |

4. **Persistent Storage / Volume Mount**: Mount a directory to `/app/data/auth-info`
   - This stores WhatsApp session credentials so you don't need to re-scan QR on every deploy.

### 3. First-time Setup

1. Deploy the app in Coolify
2. Check **Deploy Logs** — you'll see a QR code printed
3. Open WhatsApp → **Linked Devices** → **Link a Device**
4. Scan the QR code
5. Done! The bot is now live

> **Note**: The QR only appears on first deploy or after session logout. Subsequent restarts use saved credentials.

## Usage

Message the WhatsApp number with any question about the temple:

- "What are the darshan timings?"
- "When is Maha Shivaratri?"
- "How can I do Abhishekam?"
- "What vazhipadu offerings are available?"

**Commands**:
- `/help` — Show available commands
- `/reset` — Clear conversation history

## Project Structure

```
Nullclaw-Whatsapp/
├── src/
│   ├── index.js          # Entry point — Express + Baileys startup
│   ├── whatsapp.js       # Baileys connection & message handlers
│   ├── ai.js             # OpenAI-compatible API client with streaming
│   ├── temple-context.js # System prompt & Kaippulli Temple knowledge
│   └── utils.js          # Helper functions
├── data/
│   └── auth-info/        # WhatsApp session credentials (gitignored)
├── Dockerfile            # Production container build
├── .dockerignore
├── .env.example          # Environment variable template
├── coolify.json          # Coolify deployment config
└── package.json
```

## Customization

Edit `src/temple-context.js` to update:
- Temple name, location, deity
- Darshan timings
- Festival calendar
- Contact information
- AI persona and response guidelines

## Troubleshooting

| Issue | Solution |
|-------|----------|
| QR not showing | Check Coolify deploy logs; ensure printQRInTerminal is true |
| Session logged out | Delete `data/auth-info/` volume contents, redeploy |
| AI not responding | Check `OPENAI_API_KEY` and `OPENAI_BASE_URL` env vars |
| Container crashing | Verify Node.js >= 20 in Coolify build image |

## License

MIT
