/**
 * ImageGenerator - Generiert Wolpertinger-Charakter-Bilder
 *
 * Nutzt Canvas um Assets zu layern und ein finales PNG zu erstellen
 * Assets sind immer 1080x1080px
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

class ImageGenerator {
  constructor(assetsPath) {
    this.assetsPath = assetsPath;
    this.canvasSize = 1080; // Assets sind immer 1080x1080

    // Layer-Reihenfolge (von unten nach oben)
    this.layerOrder = [
      'hintergrund',
      'rahmen',
      'koerper',
      'kopf',
      'mund',
      'augen',
      'hut'
    ];
  }

  /**
   * Generiert ein Charakter-Bild
   * @param {object} characterData - { hintergrund: 'file.png', koerper: 'file.png', ... }
   * @param {object} assetManager - Optional: AssetManager für random-Assets
   * @returns {Promise<Buffer>} PNG Buffer
   */
  async generateCharacter(characterData, assetManager = null) {
    console.log('[ImageGenerator] Generiere Charakter-Bild...');

    // Canvas erstellen
    const canvas = createCanvas(this.canvasSize, this.canvasSize);
    const ctx = canvas.getContext('2d');

    // Hintergrund transparent
    ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);

    // Durch Layer iterieren und zeichnen
    for (const layer of this.layerOrder) {
      let assetName = characterData[layer];

      // Spezial-Handling für Mund: Wenn mundFrames Array vorhanden, zufälligen Frame wählen
      if (layer === 'mund' && !assetName && characterData.mundFrames && Array.isArray(characterData.mundFrames)) {
        const mundFrames = characterData.mundFrames;
        if (mundFrames.length > 0) {
          assetName = mundFrames[Math.floor(Math.random() * mundFrames.length)];
          console.log(`[ImageGenerator] Zufälliger Mund-Frame gewählt: ${assetName}`);
        }
      }

      // "random" Handling
      if (assetName === 'random' && assetManager) {
        const assets = assetManager.assetCache.get(layer) || [];
        if (assets.length > 0) {
          assetName = assets[Math.floor(Math.random() * assets.length)];
          console.log(`[ImageGenerator] Zufälliges Asset für ${layer}: ${assetName}`);
        } else {
          console.warn(`[ImageGenerator] ⚠️ Keine Assets für "${layer}" verfügbar, überspringe Layer`);
          continue;
        }
      }

      // Wenn kein Asset vorhanden, Layer überspringen
      if (!assetName || assetName === 'random') {
        console.warn(`[ImageGenerator] ⚠️ Kein Asset für "${layer}", überspringe Layer`);
        continue;
      }

      // Asset-Pfad konstruieren
      const assetPath = path.join(this.assetsPath, layer, assetName);

      // Asset laden und zeichnen
      try {
        if (!fs.existsSync(assetPath)) {
          console.warn(`[ImageGenerator] ⚠️ Asset nicht gefunden: ${assetPath}`);
          continue;
        }

        const image = await loadImage(assetPath);
        ctx.drawImage(image, 0, 0, this.canvasSize, this.canvasSize);
        console.log(`[ImageGenerator] ✅ Layer "${layer}" gezeichnet: ${assetName}`);
      } catch (err) {
        console.error(`[ImageGenerator] ❌ Fehler beim Laden von ${layer}/${assetName}:`, err.message);
        // Weiter mit nächstem Layer
      }
    }

    // Canvas als PNG Buffer zurückgeben
    const buffer = canvas.toBuffer('image/png');
    console.log(`[ImageGenerator] ✅ Charakter-Bild generiert (${buffer.length} Bytes)`);

    return buffer;
  }

  /**
   * Generiert Preview mit teilweise ausgewählten Assets
   * Nicht-ausgewählte Layer werden übersprungen
   * @param {object} partialCharacterData - { hintergrund: 'file.png', koerper: null, ... }
   * @param {object} assetManager - Optional
   * @returns {Promise<Buffer>} PNG Buffer
   */
  async generatePreview(partialCharacterData, assetManager = null) {
    // Nutzt die gleiche Logik wie generateCharacter
    return this.generateCharacter(partialCharacterData, assetManager);
  }

  /**
   * Validiert ob alle benötigten Assets existieren
   * @param {object} characterData
   * @returns {object} { valid: boolean, missingAssets: [] }
   */
  validateAssets(characterData) {
    const missingAssets = [];

    for (const layer of this.layerOrder) {
      const assetName = characterData[layer];

      if (!assetName || assetName === 'random') {
        continue; // Optional oder random
      }

      const assetPath = path.join(this.assetsPath, layer, assetName);

      if (!fs.existsSync(assetPath)) {
        missingAssets.push(`${layer}/${assetName}`);
      }
    }

    return {
      valid: missingAssets.length === 0,
      missingAssets: missingAssets
    };
  }
}

module.exports = ImageGenerator;
