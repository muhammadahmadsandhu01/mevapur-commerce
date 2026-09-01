/**
 * Format duration in milliseconds into a clean, human-readable string.
 * Supports singular and plural units (e.g., '15 minutes', '1 hour', '2 hours', '30 seconds').
 *
 * @param {number} ms Duration in milliseconds
 * @returns {string} Human-readable duration string
 */
function formatExpiryDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
    return '15 minutes';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0 && hours % 24 === 0 && minutes % 60 === 0 && seconds % 60 === 0) {
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (hours > 0 && minutes % 60 === 0 && seconds % 60 === 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (minutes > 0 && seconds % 60 === 0) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

module.exports = {
  formatExpiryDuration
};
