/**
 * WhatsApp Module — Baileys socket management, message handling, and response delivery.
 *
 * Flow:
 *   1. Start Baileys connection → QR printed to logs
 *   2. User scans QR → connection established
 *   3. Incoming messages → AI response streamed back via WhatsApp
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { chatStream } = require("./ai");

// Logger
const logger = pino({ level: "info" });

// Auth state directory (persisted on disk for session reuse)
const AUTH_DIR = process.env.AUTH_DIR || "./data/auth-info";

// Owner number (optional: only respond to this number if set)
const OWNER_NUMBER = process.env.WHATSAPP_OWNER_NUMBER || null;

// Active socket reference
let sock = null;

/**
 * Start the WhatsApp socket connection.
 * Returns the socket instance and a listener map.
 */
async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    logger,
    browser: ["Kaippulli Temple Bot", "Chrome", "1.0"],
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  // Persist credentials on every update
  sock.ev.on("creds.update", saveCreds);

  // Handle connection state changes
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("📱 QR Code received — scan with WhatsApp to authenticate");
      console.log("\n" + "═".repeat(50));
      console.log("  QR CODE FOR WHATSAPP AUTHENTICATION");
      console.log("  Open WhatsApp → Linked Devices → Link a Device");
      console.log("  Scan the QR code in the Coolify deploy logs");
      console.log("═".repeat(50) + "\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      logger.warn(
        `WhatsApp connection closed. Reconnecting: ${shouldReconnect}`
      );
      if (shouldReconnect) {
        setTimeout(connectWhatsApp, 3000);
      } else {
        logger.error(
          "WhatsApp session expired. Please scan QR code again."
        );
        console.log("\n⚠️  WhatsApp session logged out. Delete the auth-info directory and restart to get a new QR.\n");
      }
    }

    if (connection === "open") {
      logger.info("✅ WhatsApp connected successfully!");
      console.log("\n🙏 Kaippulli Temple AI Assistant is now online on WhatsApp!\n");
    }
  });

  // Handle incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    for (const msg of m.messages) {
      // Skip non-user messages (status updates, own messages, etc.)
      if (!msg.message || msg.key.fromMe) continue;

      await handleMessage(sock, msg);
    }
  });

  return sock;
}

/**
 * Handle a single incoming WhatsApp message.
 */
async function handleMessage(sock, msg) {
  const remoteJid = msg.key.remoteJid;

  // Ignore group messages (optional — remove this to enable groups)
  if (remoteJid.endsWith("@g.us")) {
    return;
  }

  // Check if message is from owner only
  if (OWNER_NUMBER && !remoteJid.includes(OWNER_NUMBER)) {
    return;
  }

  // Extract text from message (handle different message types)
  const text = extractText(msg.message);

  if (!text) {
    // Ignore non-text messages (images, audio, etc.) for now
    console.log(`[WA] Non-text message from ${remoteJid}`);
    return;
  }

  console.log(`[WA] ${remoteJid}: ${text}`);

  // Handle special commands
  if (text.toLowerCase() === "/reset") {
    const { clearConversation } = require("./ai");
    clearConversation(remoteJid);
    await sendReply(sock, remoteJid, "🙏 Conversation reset. How can I help you?");
    return;
  }

  if (text.toLowerCase() === "/help") {
    await sendReply(
      sock,
      remoteJid,
      "🙏 *Kaippulli Temple Assistant*\n\nCommands:\n/reset — Clear conversation history\n/help — Show this message\n\nOr just ask me about the temple, timings, festivals, rituals, and more!"
    );
    return;
  }

  // Send typing indicator, then stream AI response
  await sendTypingIndicator(sock, remoteJid);

  let replyText = "";
  await chatStream(remoteJid, text, (chunk) => {
    replyText += chunk;
  });

  // Send the complete response
  if (replyText.trim()) {
    await sendReply(sock, remoteJid, replyText.trim());
  }
}

/**
 * Extract readable text from a Baileys message object.
 */
function extractText(message) {
  // Plain text
  if (message.conversation) return message.conversation;
  // Extended text (with formatting)
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  return null;
}

/**
 * Send a text reply to a WhatsApp chat.
 */
async function sendReply(sock, remoteJid, text) {
  try {
    await sock.sendMessage(remoteJid, { text });
  } catch (err) {
    logger.error(`[WA] Failed to send reply: ${err.message}`);
  }
}

/**
 * Show typing indicator in the chat.
 */
async function sendTypingIndicator(sock, remoteJid) {
  try {
    await sock.sendPresenceUpdate("composing", remoteJid);
  } catch {
    // Typing indicator is best-effort
  }
}

/**
 * Get the active socket (for health checks).
 */
function getSocket() {
  return sock;
}

module.exports = {
  connectWhatsApp,
  getSocket,
  sendReply
};
