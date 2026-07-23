/**
 * Nullclaw-Whatsapp — Entry Point
 *
 * Starts Express health-check server + Baileys WhatsApp connection.
 *
 * Coolify deploy:
 *   1. Set env vars in Coolify dashboard (OPENAI_API_KEY, etc.)
 *   2. Deploy from GitHub repo
 *   3. Check deploy logs for QR code → scan with WhatsApp
 *   4. Volume mount: host path → /app/data/auth-info
 */

require("dotenv").config();

const express = require("express");
const { connectWhatsApp, getQRImage, waitForQR } = require("./whatsapp");

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();

app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    service: "nullclaw-whatsapp",
    temple: "Kaippulli Temple",
    status: "running",
    whatsapp: "connected",
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// QR code endpoint — visit this URL to scan WhatsApp login QR
app.get("/qr", async (req, res) => {
  let buffer = await getQRImage();
  if (!buffer) {
    buffer = await waitForQR();
  }
  if (buffer) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.send(buffer);
  } else {
    res.status(404).send("QR not available. Check if the bot needs authentication.");
  }
});

// ── Start ─────────────────────────────────────────────────────
async function main() {
  console.log("\n🙏 Starting Kaippulli Temple AI Assistant...\n");

  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  OPENAI_API_KEY not set — AI responses will fail.");
  }

  // Start Express
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server listening on port ${PORT}`);
    console.log(`   Health:  http://nullclaw.kaippulli.sbs/`);
    console.log(`   QR scan: http://nullclaw.kaippulli.sbs/qr\n`);
  });

  // Connect WhatsApp
  console.log("📲 Connecting to WhatsApp...");
  try {
    await connectWhatsApp();
  } catch (err) {
    console.error("❌ Failed to connect WhatsApp:", err);
    console.log("🔄 Will retry in 10 seconds...");
    setTimeout(main, 10000);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
