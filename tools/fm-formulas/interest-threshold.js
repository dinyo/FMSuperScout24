'use strict';

// Recovered FM24 arithmetic only; this does NOT calculate a player's interest.
// Build, instruction addresses and native comparison evidence:
// docs/fm24-formula-recovery.md
const MENU_THRESHOLDS = Object.freeze([-10000, -2000, 0, 5000, 10000, 30000]);

function adjustedInterestThreshold(level, managerCA, loan = false) {
  if (!Number.isInteger(level) || level < 1 || level > MENU_THRESHOLDS.length)
    throw new RangeError('Interest level must be 1 through 6.');
  if (!Number.isInteger(managerCA) || managerCA < 0 || managerCA > 200)
    throw new RangeError('Manager CA must be a known integer from 0 through 200.');
  if (typeof loan !== 'boolean') throw new TypeError('Loan mode must be a boolean.');
  const threshold = MENU_THRESHOLDS[level - 1] + 20 * (200 - managerCA);
  return loan ? Math.trunc(threshold / 2) : threshold;
}

module.exports = { MENU_THRESHOLDS, adjustedInterestThreshold };
