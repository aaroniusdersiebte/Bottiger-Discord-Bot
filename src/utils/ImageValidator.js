/**
 * ImageValidator - Sichere Bild-Validierung via Magic Bytes
 *
 * Prüft Datei-Header statt nur Extension, um Manipulation zu verhindern.
 */

// Magic Bytes für erlaubte Bildformate
const MAGIC_BYTES = {
  png: {
    bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    offset: 0,
    extension: '.png',
    mimeType: 'image/png'
  },
  jpg: {
    bytes: [0xFF, 0xD8, 0xFF],
    offset: 0,
    extension: '.jpg',
    mimeType: 'image/jpeg'
  },
  gif: {
    bytes: [0x47, 0x49, 0x46, 0x38], // GIF8
    offset: 0,
    extension: '.gif',
    mimeType: 'image/gif'
  },
  webp: {
    bytes: [0x52, 0x49, 0x46, 0x46], // RIFF
    offset: 0,
    secondaryBytes: [0x57, 0x45, 0x42, 0x50], // WEBP
    secondaryOffset: 8,
    extension: '.webp',
    mimeType: 'image/webp'
  }
};

/**
 * Prüft ob Buffer mit erwarteten Bytes beginnt
 * @param {Buffer} buffer
 * @param {number[]} expectedBytes
 * @param {number} offset
 * @returns {boolean}
 */
function matchesBytes(buffer, expectedBytes, offset = 0) {
  if (buffer.length < offset + expectedBytes.length) {
    return false;
  }

  for (let i = 0; i < expectedBytes.length; i++) {
    if (buffer[offset + i] !== expectedBytes[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validiert einen Buffer und gibt das erkannte Format zurück
 * @param {Buffer} buffer - Die zu prüfenden Bilddaten
 * @returns {{ valid: boolean, format: string|null, extension: string|null, mimeType: string|null, error: string|null }}
 */
function validateImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      valid: false,
      format: null,
      extension: null,
      mimeType: null,
      error: 'Keine gültigen Binärdaten'
    };
  }

  if (buffer.length < 12) {
    return {
      valid: false,
      format: null,
      extension: null,
      mimeType: null,
      error: 'Datei zu klein für ein gültiges Bild'
    };
  }

  // PNG prüfen
  if (matchesBytes(buffer, MAGIC_BYTES.png.bytes, MAGIC_BYTES.png.offset)) {
    return {
      valid: true,
      format: 'png',
      extension: '.png',
      mimeType: 'image/png',
      error: null
    };
  }

  // JPG prüfen
  if (matchesBytes(buffer, MAGIC_BYTES.jpg.bytes, MAGIC_BYTES.jpg.offset)) {
    return {
      valid: true,
      format: 'jpg',
      extension: '.jpg',
      mimeType: 'image/jpeg',
      error: null
    };
  }

  // GIF prüfen
  if (matchesBytes(buffer, MAGIC_BYTES.gif.bytes, MAGIC_BYTES.gif.offset)) {
    return {
      valid: true,
      format: 'gif',
      extension: '.gif',
      mimeType: 'image/gif',
      error: null
    };
  }

  // WEBP prüfen (RIFF + WEBP)
  if (matchesBytes(buffer, MAGIC_BYTES.webp.bytes, MAGIC_BYTES.webp.offset) &&
      matchesBytes(buffer, MAGIC_BYTES.webp.secondaryBytes, MAGIC_BYTES.webp.secondaryOffset)) {
    return {
      valid: true,
      format: 'webp',
      extension: '.webp',
      mimeType: 'image/webp',
      error: null
    };
  }

  return {
    valid: false,
    format: null,
    extension: null,
    mimeType: null,
    error: 'Unbekanntes oder nicht erlaubtes Bildformat'
  };
}

/**
 * Prüft ob Dateigröße im erlaubten Bereich liegt
 * @param {number} size - Dateigröße in Bytes
 * @param {number} maxSize - Maximale Größe in Bytes
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateFileSize(size, maxSize) {
  if (typeof size !== 'number' || size <= 0) {
    return {
      valid: false,
      error: 'Ungültige Dateigröße'
    };
  }

  if (size > maxSize) {
    const maxMB = (maxSize / 1024 / 1024).toFixed(1);
    const actualMB = (size / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `Datei zu groß: ${actualMB}MB (max: ${maxMB}MB)`
    };
  }

  return {
    valid: true,
    error: null
  };
}

/**
 * Vollständige Validierung eines Bild-Buffers
 * @param {Buffer} buffer
 * @param {number} maxSize
 * @returns {{ valid: boolean, format: string|null, extension: string|null, mimeType: string|null, error: string|null }}
 */
function validateImage(buffer, maxSize) {
  // Größe prüfen
  const sizeResult = validateFileSize(buffer.length, maxSize);
  if (!sizeResult.valid) {
    return {
      valid: false,
      format: null,
      extension: null,
      mimeType: null,
      error: sizeResult.error
    };
  }

  // Format prüfen
  return validateImageBuffer(buffer);
}

module.exports = {
  validateImageBuffer,
  validateFileSize,
  validateImage,
  MAGIC_BYTES
};
