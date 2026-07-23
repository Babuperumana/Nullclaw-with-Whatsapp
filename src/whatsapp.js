/**
 * WhatsApp Module — Baileys socket management, message handling, and response delivery.
 *
 * Auth:
 *   - Credentials stored in AUTH_DIR (mounted volume for persistence)
 *   - First run: Baileys emits QR via connection.update → saved as PNG
 *   - User scans via http://<server>:3000/qr → creds persisted → restarts seamless
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

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const registered = state.creds?.registered;
  console.log(`[WA] Auth: ${registered ? "logged in" : "no credentials — QR scan required"}`);

  sock = makeWASocket({
    auth: state,
    logger,
    browser: ["Ubuntu", "Chrome", "120.0.0.0"],
    connectTimeoutMs: 120_000,
    keepAliveIntervalMs: 30_000,
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", () => {
    saveCreds();
    console.log("[WA] Credentials saved.");
  });

  // BAileys v6: QR comes through connection.update, NOT a separate "qr" event
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR arrives here in v6 — save it as a PNG
    if (qr) {
      console.log("\n" + "═".repeat(55));
      console.log("  🙏 SCAN QR — Visit: http://nullclaw.kaippulli.sbs/qr");
      console.log("  Or: WhatsApp → Linked Devices → Link a Device");
      console.log("═".repeat(55));
      try {
        await QRCode.toFile(QR_FILE, qr, {
          width: 512,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" }
        });
        console.log(`   Saved: ${QR_FILE}\n`);
      } catch (err) {
        console.error("   QR save error:", err.message);
        console.log("   QR string:", qr);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "unknown";
      console.log(`[WA] Disconnected (code: ${code}, reason: ${reason})`);
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        let delay;
        if (code === 405) {
          console.log("[WA] ⚠️  WhatsApp rejected registration (code 405).");
          console.log("[WA]   Possible causes:");
          console.log("[WA]   - Too many failed attempts (wait 5+ minutes)");
          console.log("[WA]   - Max linked devices reached (4 per account)");
          console.log("[WA]   - Unlink a device from WhatsApp → Linked Devices first");
          delay = 300000 + Math.floor(Math.random() * 120000); // 5-7 min
          console.log(`[WA]   Retrying in ${Math.round(delay/60000)} minutes...`);
        } else {
          delay = 5000 + Math.floor(Math.random() * 5000);
          console.log(`[WA] Reconnecting in ${Math.round(delay/1000)}s...`);
        }
        setTimeout(connectWhatsApp, delay);
      } else {
        console.log("[WA] Session logged out. Clear auth and restart.");
      }
    }

    if (connection === "open") {
      console.log("\n🙏 Kaippulli Temple AI Assistant is ONLINE!\n");
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
      "🙏 *Kaippulli Temple Assistant*\n\n/reset — Clear history\n/help — This message\n\nAsk about darshan, festivals, rituals, and more!"
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
  catch (err) { console.error(`[WA] Send error: ${err.message}`); }
}

async function sendTypingIndicator(sock, remoteJid) {
  try { await sock.sendPresenceUpdate("composing", remoteJid); } catch {}
}

function getSocket() { return sock; }

function getQRImage() {
  try {
    if (fs.existsSync(QR_FILE)) return fs.readFileSync(QR_FILE);
  } catch {}
  return null;
}

/**
 * Create a promise that resolves when QR is generated.
 * Used by index.js /qr endpoint for direct socket QR.
 */
function waitForQR() {
  return new Promise((resolve) => {
    const handler = (update) => {
      if (update.qr) {
        sock.ev.off("connection.update", handler);
        resolve(update.qr);
      }
    };
    sock.ev.on("connection.update", handler);
    // Timeout after 2 minutes
    setTimeout(() => {
      sock.ev.off("connection.update", handler);
      resolve(null);
    }, 120_000);
  });
}

module.exports = {
  connectWhatsApp,
  getSocket,
  getQRImage,
  waitForQR
};
