/**
 * Progress-Balken Utility
 *
 * Generiert visuelle Progress-Balken mit Emoji-Blöcken
 * für Discord Embeds
 */

/**
 * Generiert Progress-Balken mit Emoji-Blöcken
 * @param {number} value - Aktueller Wert
 * @param {number} maxValue - Maximum-Wert (für Prozent-Berechnung)
 * @param {number} barLength - Anzahl der Blöcke (Standard: 10)
 * @returns {string} Emoji-Balken
 */
function generateProgressBar(value, maxValue, barLength = 10) {
  if (maxValue === 0) return '░'.repeat(barLength);

  const percentage = Math.min(100, (value / maxValue) * 100);
  const filledBlocks = Math.round((percentage / 100) * barLength);
  const emptyBlocks = barLength - filledBlocks;

  return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
}

module.exports = { generateProgressBar };
