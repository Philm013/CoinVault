/* global cv */
import { DB } from './db.js';
import { AI } from './ai.js';
import { Capture } from './capture.js';
import { UI } from './ui.js';

export const App = {
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

            await DB.init();
            await AI.init();
            Capture.init('cameraVideo', 'captureCanvas');
            UI.init(this);
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

    async loadCollection() {
        const items = await DB.getAllItems();
        UI.renderCollection(items);
        UI.renderDashboard(items);
    },

    async saveSettings(apiKey, model) {
        await DB.saveSetting('geminiApiKey', apiKey);
        await DB.saveSetting('geminiModel', model);
        AI.apiKey = apiKey;
        if (model) AI.modelName = model;
        UI.showToast("Settings saved!", "success");
    },

    async processCapturedItems() {
        const crops = Capture.extractCrops();
        if (crops.length === 0) {
            UI.showToast("No items selected. Draw boxes over each item.", "warning");
            return;
        }

        UI.showLoading(`Processing ${crops.length} item(s)...`);
        for (const [index, cropBase64] of crops.entries()) {
            try {
                UI.showLoading(`AI Analyzing item ${index + 1} of ${crops.length}...`);
                const aiData = await AI.identifyItem(cropBase64);
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
                console.error("Process failed", e);
                UI.showToast(`Error processing item ${index + 1}: ${e.message}`, "error");
            }
        }

        UI.hideLoading();
        UI.showToast("Processing complete!", "success");
        Capture.clearBoxes();
        this.loadCollection();
        UI.switchView('collectionView');
    },

    async deleteItem(id) {
        if(confirm("Are you sure you want to delete this item?")) {
            await DB.deleteItem(id);
            UI.showToast("Item deleted.", "success");
            this.loadCollection();
        }
    },

    async saveItemEdit(itemData) {
        await DB.updateItem(itemData);
        UI.showToast("Item updated!", "success");
        this.loadCollection();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());