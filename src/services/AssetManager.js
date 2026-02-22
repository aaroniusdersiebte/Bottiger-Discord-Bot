/**
 * AssetManager - Lädt Assets aus dem Visualizer-Verzeichnis
 *
 * Liest direkt aus dem Assets-Ordner des Stream Visualizers
 * Wird im Standalone-Mode verwendet (wenn Visualizer aus ist)
 */

const fs = require('fs');
const path = require('path');

class AssetManager {
  constructor(assetsPath) {
    this.assetsPath = assetsPath;
    this.assetCache = new Map(); // Cache für Asset-Listen
    this.assetCategories = ['hintergrund', 'koerper', 'kopf', 'augen', 'hut', 'rahmen'];
    this.lastLoad = null;
  }

  /**
   * Lädt Asset-Listen aus dem Assets-Verzeichnis
   * @returns {object} Assets nach Kategorien
   */
  loadAssets() {
    console.log('[AssetManager] Lade Assets aus:', this.assetsPath);

    if (!fs.existsSync(this.assetsPath)) {
      console.error('[AssetManager] ❌ Assets-Verzeichnis nicht gefunden:', this.assetsPath);
      throw new Error(`Assets-Verzeichnis nicht gefunden: ${this.assetsPath}`);
    }

    const assets = {};

    for (const category of this.assetCategories) {
      const categoryPath = path.join(this.assetsPath, category);

      if (!fs.existsSync(categoryPath)) {
        console.warn(`[AssetManager] ⚠️ Kategorie-Ordner nicht gefunden: ${categoryPath}`);
        assets[category] = [];
        this.assetCache.set(category, []);
        continue;
      }

      try {
        const files = fs.readdirSync(categoryPath)
          .filter(file => file.endsWith('.png') || file.endsWith('.jpg'));

        assets[category] = files;
        this.assetCache.set(category, files);

        console.log(`[AssetManager] ✅ ${category}: ${files.length} Assets`);
      } catch (err) {
        console.error(`[AssetManager] ❌ Fehler beim Lesen von ${category}:`, err.message);
        assets[category] = [];
        this.assetCache.set(category, []);
      }
    }

    // Mund-Frames separat laden
    const mundPath = path.join(this.assetsPath, 'mund');
    if (fs.existsSync(mundPath)) {
      try {
        const mundFiles = fs.readdirSync(mundPath)
          .filter(file => file.endsWith('.png') || file.endsWith('.jpg'));

        assets.mund = mundFiles;
        this.assetCache.set('mund', mundFiles);

        console.log(`[AssetManager] ✅ mund: ${mundFiles.length} Frames`);
      } catch (err) {
        console.error('[AssetManager] ❌ Fehler beim Lesen von mund:', err.message);
        assets.mund = [];
        this.assetCache.set('mund', []);
      }
    } else {
      assets.mund = [];
      this.assetCache.set('mund', []);
    }

    this.lastLoad = Date.now();
    console.log('[AssetManager] ✅ Assets geladen');

    return assets;
  }

  /**
   * Gibt Assets zurück (aus Cache oder lädt neu)
   * @param {boolean} forceReload - Erzwinge Neu-Laden
   * @returns {object}
   */
  getAssets(forceReload = false) {
    // Cache älter als 5 Minuten? → Neu laden
    const cacheAge = this.lastLoad ? Date.now() - this.lastLoad : Infinity;
    const cacheExpired = cacheAge > 300000; // 5 Minuten

    if (forceReload || cacheExpired || this.assetCache.size === 0) {
      return this.loadAssets();
    }

    // Aus Cache zurückgeben
    const assets = {};
    for (const [category, files] of this.assetCache.entries()) {
      assets[category] = files;
    }

    return assets;
  }

  /**
   * Generiert zufälligen Charakter
   * @returns {object}
   */
  generateRandomCharacter() {
    const character = {};

    // Für jede Kategorie: Zufälliges Asset
    for (const category of this.assetCategories) {
      const assets = this.assetCache.get(category) || [];

      if (assets.length === 0) {
        console.warn(`[AssetManager] ⚠️ Keine Assets für "${category}"`);
        character[category] = null;
        continue;
      }

      // Zufälliges Asset
      const randomAsset = assets[Math.floor(Math.random() * assets.length)];
      character[category] = randomAsset;
    }

    // Mund-Frames: Alle verfügbaren
    const mundAssets = this.assetCache.get('mund') || [];
    character.mundFrames = mundAssets;

    console.log('[AssetManager] Zufälliger Charakter generiert');
    return character;
  }

  /**
   * Validiert ob Asset existiert
   * @param {string} category
   * @param {string} assetName
   * @returns {boolean}
   */
  validateAsset(category, assetName) {
    if (assetName === 'random') return true;

    const assets = this.assetCache.get(category) || [];
    return assets.includes(assetName);
  }
}

module.exports = AssetManager;
