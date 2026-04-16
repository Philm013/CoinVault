import { DB } from './db.js';

/**
 * Gemini API integration for model discovery and coin/currency identification.
 */
export const AI = {
    apiKey: null,
    modelName: 'gemini-1.5-flash',

    /**
     * Loads API key and preferred model from persistent settings.
     * @returns {Promise<void>}
     */
    async init() {
        this.apiKey = await DB.getSetting('geminiApiKey');
        const model = await DB.getSetting('geminiModel');
        if (model) this.modelName = model;
    },

    /**
     * Fetches generative models that support `generateContent`.
     * @returns {Promise<object[]>}
     */
    async fetchAvailableModels() {
        if (!this.apiKey) return [];
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            // Keep only models that can handle text+image prompting for this app.
            return data.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));
        } catch (e) {
            console.error("Error listing models:", e);
            return [];
        }
    },

    /**
     * Sends a captured item image to Gemini and expects a JSON-only response.
     * @param {string} base64Image - Data URL (`data:image/...;base64,...`).
     * @returns {Promise<object>}
     */
    async identifyItem(base64Image) {
        if (!this.apiKey) {
            throw new Error('Gemini API Key is not set. Please set it in settings.');
        }

        const prompt = `
            Analyze this coin or currency image. Identify the item and estimate its value.
            Return ONLY a valid JSON object with the following structure, no markdown formatting or extra text:
            {
                "country": "Country of origin",
                "denomination": "e.g., 1 Cent, 1 Dollar, 5 Pounds",
                "year": "YYYY",
                "mintMark": "Mint mark if visible, otherwise null",
                "metal": "e.g., Copper, Silver, Gold, Nickel, Bi-Metallic",
                "grade": "Estimated numismatic grade (e.g., G, F, VF, XF, AU, MS60)",
                "estimatedValue": numeric value representing estimated market value in USD,
                "citation": "Source or reasoning for the value estimation (e.g., Numista, recent auction prices)",
                "description": "Brief historical or design detail"
            }
            If any information cannot be determined, use null for that field (or 0 for estimatedValue).
        `;

        // Gemini inlineData accepts raw base64 bytes and explicit MIME type.
        const base64Data = base64Image.split(',')[1];
        const mimeType = base64Image.split(';')[0].split(':')[1];

        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const textResult = data.candidates[0].content.parts[0].text;
        
        try {
            // Defensive cleanup in case the model wraps JSON in markdown fences.
            const jsonStr = textResult.replace(/```json\n|\n```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse AI response as JSON:", textResult, e);
            throw new Error('Invalid response format from AI');
        }
    }
};
