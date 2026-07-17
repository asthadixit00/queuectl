/**
 * Calculates retry delay in seconds using exponential backoff.
 * Formula per spec: delay = base ^ attempts
 *
 * Example with base=2:
 *   attempts=1 -> 2s
 *   attempts=2 -> 4s
 *   attempts=3 -> 8s
 */
function calculateBackoffSeconds(attempts, base) {
  return Math.pow(base, attempts);
}

/**
 * Returns an ISO timestamp representing "now + delaySeconds".
 */
function getNextAttemptTime(attempts, base) {
  const delaySeconds = calculateBackoffSeconds(attempts, base);
  const nextTime = new Date(Date.now() + delaySeconds * 1000);
  return { nextAttemptAt: nextTime.toISOString(), delaySeconds };
}

module.exports = { calculateBackoffSeconds, getNextAttemptTime };