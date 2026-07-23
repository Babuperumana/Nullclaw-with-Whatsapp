/**
 * AI Client — wraps OpenAI-compatible API for the WhatsApp bot.
 * Handles conversation memory, streaming responses, and error handling.
 */

const OpenAI = require("openai");
const { buildSystemPrompt } = require("./temple-context");

// Max conversation turns to keep in memory (user + assistant pairs)
const MAX_HISTORY_MESSAGES = 20;

/**
 * Conversation store — in-memory map keyed by WhatsApp JID.
 * Resets on container restart (acceptable for MVP).
 */
const conversations = new Map();

/**
 * Get or create a conversation for a remote JID.
 * @param {string} remoteJid — WhatsApp JID (e.g. "919XXXXXXXXXX@s.whatsapp.net")
 */
function getConversation(remoteJid) {
  if (!conversations.has(remoteJid)) {
    conversations.set(remoteJid, []);
  }
  return conversations.get(remoteJid);
}

/**
 * Add a message to a user's conversation history.
 * @param {string} remoteJid
 * @param {"user" | "assistant"} role
 * @param {string} content
 */
function appendMessage(remoteJid, role, content) {
  const history = getConversation(remoteJid);
  history.push({ role, content });

  // Trim to max length (keep system prompt space)
  while (history.length > MAX_HISTORY_MESSAGES) {
    history.shift();
  }
}

/**
 * Clear conversation for a user (e.g. on /reset command).
 */
function clearConversation(remoteJid) {
  conversations.set(remoteJid, []);
}

/**
 * Get the full messages array for the API call (system + history).
 */
function buildMessages(remoteJid) {
  const history = getConversation(remoteJid);
  return [
    { role: "system", content: buildSystemPrompt() },
    ...history
  ];
}

/**
 * Send a message to the AI and stream the response back.
 * Calls the OpenAI-compatible API with streaming enabled.
 *
 * @param {string} remoteJid
 * @param {string} userMessage
 * @param {(chunk: string) => void} onChunk — called with each text delta
 * @returns {Promise<string>} — full response text
 */
async function chatStream(remoteJid, userMessage, onChunk) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "sk-placeholder",
    baseURL: process.env.OPENAI_BASE_URL || "https://omni.kaippulli.sbs/v1"
  });

  const messages = buildMessages(remoteJid);
  messages.push({ role: "user", content: userMessage });

  // Save user message to history
  appendMessage(remoteJid, "user", userMessage);

  try {
    const stream = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gemini/gemini-2.0-flash-lite",
      messages: messages,
      max_tokens: 1024,
      temperature: 0.7,
      stream: true
    });

    let fullText = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }

    // Save assistant response to history
    appendMessage(remoteJid, "assistant", fullText);
    return fullText;

  } catch (error) {
    console.error("[AI] API error:", error.message);
    const fallback = "🙏 I'm having trouble connecting right now. Please try again in a moment, or contact the temple authorities directly.";
    appendMessage(remoteJid, "assistant", fallback);
    onChunk(fallback);
    return fallback;
  }
}

/**
 * Send a message and get the full response at once (non-streaming).
 * Useful for quick responses or error messages.
 */
async function chatSync(remoteJid, userMessage) {
  return new Promise((resolve) => {
    let full = "";
    chatStream(remoteJid, userMessage, (chunk) => { full += chunk; })
      .then(() => resolve(full))
      .catch(() => resolve("🙏 Sorry, something went wrong. Please try again."));
  });
}

module.exports = {
  chatStream,
  chatSync,
  clearConversation,
  conversations
};
