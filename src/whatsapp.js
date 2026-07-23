/**
 * WhatsApp Module — Baileys socket management, message handling, and response delivery.
 *
 * Auth:
 *   - Stores credentials in AUTH_DIR (mounted volume for persistence)
 *   - On first run (no creds): generates QR code, saves as PNG
 *   - User scans QR → creds saved → subsequent restarts are seamless
 *
 * QR access:
 *   - Saved as PNG: /app/data/auth-info/qr.png
 *   - Served at: GET /qr (from index.js)
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const { chatStream } = require("./ai");
const fs = require("fs");
const path = require("path");

const logger = pino({ level: "info" });

const AUTH_DIR = process.env.AUTH_DIR || "./data/auth-info";
const OWNER_NUMBER = process.env.WHATSAPP_OWNER_NUMBER || null;
const QR_FILE = path.join(AUTH_DIR, "qr.png");

let sock = null;
let qrResolve = null; // promise resolver for QR readiness

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // Check if already authenticated
  const hasCreds = state.creds && state.creds.registered;
  console.log(`[WA] Auth state: ${hasCreds ? "already logged in" : "no credentials — need QR scan"}`);

  sock = makeWASocket({
    auth: state,
    logger,
    browser: ["Kaippulli Temple Bot", "Chrome", "1.0"],
    connectTimeoutMs: 120_000,
    keepAliveIntervalMs: 30_000,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    qrOnFailure: true,
    getError: (error) => {
      // Log errors instead of silently swallowing them
      console.error("[WA] Socket error:", error?.message || error);
      return undefined;
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Listen for QR — Baileys v6 emits via connection.update or qr event
  const handleQR = async (qr) => {
    console.log("\n" + "═".repeat(50));
    console.log("  🙏 Kaippulli Temple Bot — WhatsApp Login Required");
    console.log("  1. Open WhatsApp on your phone");
    console.log("  2. Tap Linked Devices → Link a Device");
    console.log("  3. Scan the QR code:");
    console.log("  → Visit http://nullclaw.kaippulli.sbs/qr");
    console.log("═".repeat(50));
    try {
      await QRCode.toFile(QR_FILE, qr, {
        width: 512,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" }
      });
      console.log("   QR image saved. Visit /qr to scan.\n");
    } catch (err) {
      console.error("   Failed to save QR image:", err.message);
      console.log("   QR string:", qr);
    }
    if (qrResolve) qrResolve();
  };

  sock.ev.on("qr", handleQR);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !hasCreds) {
      await handleQR(qr);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      logger.warn(`WhatsApp closed (code: ${code}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectWhatsApp, 5000);
      } else {
        console.log("\n⚠️  Session logged out. Clear auth and restart.\n");
      }
    }

    if (connection === "open") {
      logger.info("✅ WhatsApp connected!");
      console.log("\n🙏 Kaippulli Temple AI Assistant is online!\n");
      try { fs.unlinkSync(QR_FILE); } catch {}
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    for (const msg of m.messages) {
      if (!msg.message || msg.key.fromMe) continue;
      await handleMessage(sock, msg);
    }
  });

  return sock;
}

async function handleMessage(sock, msg) {
  const remoteJid = msg.key.remoteJid;

  if (remoteJid.endsWith("@g.us")) return;
  if (OWNER_NUMBER && !remoteJid.includes(OWNER_NUMBER)) return;

  const text = extractText(msg.message);
  if (!text) {
    console.log(`[WA] Non-text from ${remoteJid}`);
    return;
  }

  console.log(`[WA] ${remoteJid}: ${text}`);

  if (text.toLowerCase() === "/reset") {
    const { clearConversation } = require("./ai");
    clearConversation(remoteJid);
    await sendReply(sock, remoteJid, "🙏 Conversation reset. How can I help you?");
    return;
  }

  if (text.toLowerCase() === "/help") {
    await sendReply(sock, remoteJid,
      "🙏 *Kaippulli Temple Assistant*\n\n/reset — Clear history\n/help — This message\n\nAsk about darshan timings, festivals, rituals, and more!"
    );
    return;
  }

  await sendTypingIndicator(sock, remoteJid);
  let replyText = "";
  await chatStream(remoteJid, text, (chunk) => { replyText += chunk; });
  if (replyText.trim()) await sendReply(sock, remoteJid, replyText.trim());
}

function extractText(message) {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  return null;
}

async function sendReply(sock, remoteJid, text) {
  try { await sock.sendMessage(remoteJid, { text }); }
  catch (err) { logger.error(`[WA] Send failed: ${err.message}`); }
}

async function sendTypingIndicator(sock, remoteJid) {
  try { await sock.sendPresenceUpdate("composing", remoteJid); } catch {}
}

function getSocket() { return sock; }

async function getQRImage() {
  try {
    if (fs.existsSync(QR_FILE)) return fs.readFileSync(QR_FILE);
  } catch {}
  return null;
}

/**
 * Wait for a QR code to be generated (with timeout).
 * Returns the QR PNG buffer or null on timeout.
 */
async function waitForQR(timeoutMs = 120000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      qrResolve = null;
      resolve(null);
    }, timeoutMs);
    qrResolve = () => {
      clearTimeout(timer);
      qrResolve = null;
      getQRImage().then(resolve);
    };
  });
}

module.exports = {
  connectWhatsApp,
  getSocket,
  getQRImage,
  waitForQR
};
