/**
 * IndexedDB wrapper used by CoinVault.
 * Provides a small promise-based API for items and app settings.
 */
export const DB = {
    // Database identity/version for schema upgrades.
    dbName: 'CoinVault_DB',
    dbVersion: 1,
    db: null,

    /**
     * Opens (or creates/upgrades) the database and required object stores.
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("Database error: " + event.target.errorCode);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Main collection store keyed by item ID.
                if (!db.objectStoreNames.contains('items')) {
                    const itemsStore = db.createObjectStore('items', { keyPath: 'id' });
                    // Optional indexes used for filtering/sorting patterns.
                    itemsStore.createIndex('country', 'country', { unique: false });
                    itemsStore.createIndex('year', 'year', { unique: false });
                    itemsStore.createIndex('metal', 'metal', { unique: false });
                    itemsStore.createIndex('dateAdded', 'dateAdded', { unique: false });
                }
                // Generic key/value settings store for configuration values.
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    },

    /**
     * Inserts a new item in the collection store.
     * @param {object} itemData
     * @returns {Promise<IDBValidKey>}
     */
    async addItem(itemData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readwrite');
            const store = transaction.objectStore('items');
            const request = store.add(itemData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Upserts an existing item by keyPath (`id`).
     * @param {object} itemData
     * @returns {Promise<IDBValidKey>}
     */
    async updateItem(itemData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readwrite');
            const store = transaction.objectStore('items');
            const request = store.put(itemData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Retrieves one item by ID.
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getItem(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readonly');
            const store = transaction.objectStore('items');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Deletes one item by ID.
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteItem(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readwrite');
            const store = transaction.objectStore('items');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Retrieves all stored items.
     * @returns {Promise<object[]>}
     */
    async getAllItems() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['items'], 'readonly');
            const store = transaction.objectStore('items');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Saves a settings key/value pair.
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Reads a settings value by key.
     * @param {string} key
     * @returns {Promise<*|null>}
     */
    async getSetting(key) {
        return new Promise((resolve, reject) => {
            // Guard against early calls before DB.init() resolves.
            if (!this.db) {
                resolve(null);
                return;
            }
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }
};
