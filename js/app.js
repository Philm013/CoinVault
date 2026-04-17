/* global cv */
import { DB } from './db.js';
import { AI } from './ai.js';
import { Capture } from './capture.js';
import { UI } from './ui.js';

/**
 * Application orchestrator.
 * Coordinates startup, persistence, camera capture, AI analysis, and UI updates.
 */
export const App = {
    /**
     * Bootstraps all app modules and sets the initial view state.
     * @returns {Promise<void>}
     */
    async init() {
        try {
            // Wait for OpenCV to be ready
            if (typeof cv === 'undefined' || !cv.getBuildInformation) {
                await new Promise(resolve => {
                    const checkCV = setInterval(() => {
                        if (typeof cv !== 'undefined' && cv.getBuildInformation) {
                            clearInterval(checkCV);
                            resolve();
                        }
                    }, 100);
                });
            }

            // Initialize persistence first so settings are available for AI/UI setup.
            await DB.init();
            // Load AI configuration (API key + selected model) from IndexedDB.
            await AI.init();
            // Prepare camera/canvas handlers used by the capture view.
            Capture.init('cameraVideo', 'captureCanvas');
            // Wire all UI event handlers after modules are ready.
            UI.init(this);
            // Populate dashboard/collection with saved items.
            this.loadCollection();

            // Hide CV Loading screen
            const loader = document.getElementById('cvLoading');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 500);
            }

            if (!AI.apiKey) {
                UI.showToast("Please set your Gemini API Key in Settings.", "warning");
                UI.switchView('settingsView');
            }
        } catch (e) {
            console.error("Init failed", e);
            UI.showToast("Failed to initialize app.", "error");
        }
    },

    /**
     * Loads all saved items and refreshes collection + dashboard sections.
     * @returns {Promise<void>}
     */
    async loadCollection() {
        const items = await DB.getAllItems();
        UI.renderCollection(items);
        UI.renderDashboard(items);
    },

    /**
     * Persists settings and applies them to the active AI session.
     * @param {string} apiKey - Gemini API key.
     * @param {string} model - Gemini model name.
     * @returns {Promise<void>}
     */
    async saveSettings(apiKey, model) {
        await DB.saveSetting('geminiApiKey', apiKey);
        await DB.saveSetting('geminiModel', model);
        AI.apiKey = apiKey;
        if (model) AI.modelName = model;
        UI.showToast("Settings saved!", "success");
    },

    /**
     * Sends each selected crop to AI, normalizes returned fields, and stores them.
     * @returns {Promise<void>}
     */
    async processCapturedItems() {
        // Convert current selection boxes into cropped base64 images.
        let crops = [];
        try {
            crops = Capture.extractCrops();
        } catch (e) {
            console.error("Crop extraction failed", e);
            UI.showToast("Couldn't process selected items. Try retaking the photo or redrawing selections.", "error");
            return;
        }

        if (crops.length === 0) {
            UI.showToast("No items selected. Draw boxes over each item.", "warning");
            return;
        }

        UI.showLoading(`Processing ${crops.length} item(s)...`);
        try { 
            for (const [index, cropBase64] of crops.entries()) {
                try {
                    UI.showLoading(`AI Analyzing item ${index + 1} of ${crops.length}...`);
                    const aiData = await AI.identifyItem(cropBase64);
                    // Build a complete record with safe defaults for missing AI fields.
                    const itemInfo = {
                        id: 'coin_' + Date.now() + '_' + index,
                        imageBlob: cropBase64,
                        country: aiData.country || 'Unknown',
                        denomination: aiData.denomination || 'Unknown',
                        year: aiData.year || 'Unknown',
                        mintMark: aiData.mintMark || '',
                        metal: aiData.metal || 'Unknown',
                        grade: aiData.grade || 'Raw',
                        estimatedValue: aiData.estimatedValue || 0,
                        citation: aiData.citation || 'AI Market Estimation',
                        description: aiData.description || '',
                        dateAdded: new Date().toISOString(),
                        tags: []
                    };
                    await DB.addItem(itemInfo);
                } catch (e) {
                    // Continue processing remaining items even if one fails.
                    console.error("Process failed", e);
                    UI.showToast(`Error processing item ${index + 1}: ${e.message}`, "error");
                }
            }
        } finally {
            UI.hideLoading();
        }

        UI.showToast("Processing complete!", "success");
        Capture.clearBoxes();
        this.loadCollection();
        UI.switchView('collectionView');
    },

    /**
     * Deletes an item after user confirmation, then refreshes visible data.
     * @param {string} id - Item identifier.
     * @returns {Promise<void>}
     */
    async deleteItem(id) {
        if(confirm("Are you sure you want to delete this item?")) {
            await DB.deleteItem(id);
            UI.showToast("Item deleted.", "success");
            this.loadCollection();
        }
    },

    /**
     * Saves edits made in the item detail form and refreshes list/dashboard views.
     * @param {object} itemData - Updated item payload.
     * @returns {Promise<void>}
     */
    async saveItemEdit(itemData) {
        await DB.updateItem(itemData);
        UI.showToast("Item updated!", "success");
        this.loadCollection();
    }
};

// Start the app once the DOM is fully parsed and all IDs are queryable.
document.addEventListener('DOMContentLoaded', () => App.init());
