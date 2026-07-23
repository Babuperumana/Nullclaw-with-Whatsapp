/**
 * Utility helpers for the WhatsApp bot.
 */

/**
 * Format a timestamp for logging.
 */
function formatTime(date) {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true
  });
}

/**
 * Truncate a string with ellipsis.
 */
function truncate(str, maxLen = 100) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Sanitize input — strip null bytes and control characters.
 */
function sanitize(input) {
  if (typeof input !== "string") return "";
  return input.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

module.exports = {
  formatTime,
  truncate,
  sanitize
};
