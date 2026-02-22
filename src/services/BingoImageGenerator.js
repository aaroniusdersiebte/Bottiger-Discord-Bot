/**
 * BingoImageGenerator - Generiert Bingo-Karten als Bilder
 *
 * Verwendet node-canvas fuer die Bild-Generierung
 */

const { createCanvas, registerFont } = require('canvas');

class BingoImageGenerator {
  constructor() {
    // Farben (Dark Theme)
    this.colors = {
      background: '#1a1a1a',
      cellBackground: '#2d2d2d',
      cellBorder: '#3a3a3a',
      cellText: '#ffffff',
      cellTextMuted: '#888888',
      markedBackground: '#3a3a3a',
      markedBorder: '#ff9500',
      verifiedBackground: 'rgba(52, 199, 89, 0.3)',
      verifiedBorder: '#34c759',
      verifiedText: '#34c759',
      headerText: '#888888'
    };

    // Dimensionen
    this.padding = 20;
    this.cellPadding = 8;
    this.headerHeight = 40;
  }

  /**
   * Generiert ein Bingo-Karten-Bild
   * @param {Array} card - 2D-Array mit Events
   * @param {Array} markedEvents - IDs der vom User markierten Events
   * @param {Array} verifiedEvents - IDs der verifizierten Events
   * @returns {Buffer} - PNG-Buffer
   */
  async generate(card, markedEvents = [], verifiedEvents = []) {
    if (!card || !Array.isArray(card) || card.length === 0) {
      return this._generateErrorImage('Keine Karte verfuegbar');
    }

    const gridSize = card.length;
    const canvasSize = 500;
    const cellSize = (canvasSize - 2 * this.padding) / gridSize;

    const canvas = createCanvas(canvasSize, canvasSize + this.headerHeight);
    const ctx = canvas.getContext('2d');

    // Hintergrund
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header
    ctx.fillStyle = this.colors.headerText;
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BINGO', canvas.width / 2, 28);

    // Grid zeichnen
    const markedSet = new Set(markedEvents);
    const verifiedSet = new Set(verifiedEvents);

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const event = card[row][col];
        const x = this.padding + col * cellSize;
        const y = this.headerHeight + this.padding + row * cellSize;

        const isMarked = markedSet.has(event.id);
        const isVerified = verifiedSet.has(event.id);

        this._drawCell(ctx, x, y, cellSize, event.text, isMarked, isVerified);
      }
    }

    return canvas.toBuffer('image/png');
  }

  /**
   * Zeichnet eine einzelne Zelle
   */
  _drawCell(ctx, x, y, size, text, isMarked, isVerified) {
    const innerSize = size - 4; // 2px Abstand zwischen Zellen

    // Hintergrund
    if (isVerified) {
      ctx.fillStyle = this.colors.verifiedBackground;
    } else if (isMarked) {
      ctx.fillStyle = this.colors.markedBackground;
    } else {
      ctx.fillStyle = this.colors.cellBackground;
    }

    // Abgerundetes Rechteck
    this._roundRect(ctx, x + 2, y + 2, innerSize, innerSize, 8);
    ctx.fill();

    // Border
    if (isVerified) {
      ctx.strokeStyle = this.colors.verifiedBorder;
      ctx.lineWidth = 2;
    } else if (isMarked) {
      ctx.strokeStyle = this.colors.markedBorder;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = this.colors.cellBorder;
      ctx.lineWidth = 1;
    }
    this._roundRect(ctx, x + 2, y + 2, innerSize, innerSize, 8);
    ctx.stroke();

    // Text
    if (isVerified) {
      ctx.fillStyle = this.colors.verifiedText;
    } else {
      ctx.fillStyle = this.colors.cellText;
    }

    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text umbrechen
    const maxWidth = innerSize - 2 * this.cellPadding;
    const lines = this._wrapText(ctx, text, maxWidth);
    const lineHeight = 13;
    const totalHeight = lines.length * lineHeight;
    const startY = y + 2 + innerSize / 2 - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, index) => {
      ctx.fillText(line, x + 2 + innerSize / 2, startY + index * lineHeight);
    });

    // Haken bei verifizierten Events
    if (isVerified) {
      ctx.fillStyle = this.colors.verifiedBorder;
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText('✓', x + innerSize - 8, y + 16);
    }
  }

  /**
   * Zeichnet ein abgerundetes Rechteck
   */
  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Bricht Text in mehrere Zeilen um
   */
  _wrapText(ctx, text, maxWidth) {
    if (!text) return [''];

    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    // Max 4 Zeilen
    if (lines.length > 4) {
      lines.length = 4;
      lines[3] = lines[3].substring(0, lines[3].length - 3) + '...';
    }

    return lines;
  }

  /**
   * Generiert ein Fehler-Bild
   */
  _generateErrorImage(message) {
    const canvas = createCanvas(400, 200);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, 400, 200);

    ctx.fillStyle = '#ff453a';
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, 200, 100);

    return canvas.toBuffer('image/png');
  }
}

module.exports = BingoImageGenerator;
