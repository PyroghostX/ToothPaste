/**
 * PasteHistoryService.js
 *
 * Manages paste history with encrypted local storage.
 * All data stays on-device, encrypted via EncryptedStorage.
 */

import * as EncryptedStorage from '../localSecurity/EncryptedStorage';

const HISTORY_CLIENT_ID = 'paste-history';
const HISTORY_INDEX_KEY = 'history-index';
const MAX_HISTORY_ITEMS = 20;
const MAX_TEXT_LENGTH = 2000; // Characters stored per entry

/**
 * Load the history index array from encrypted storage.
 * @returns {Promise<Array>}
 */
export async function listHistory() {
    if (!EncryptedStorage.isUnlocked()) return [];
    try {
        const index = await EncryptedStorage.loadBase64(HISTORY_CLIENT_ID, HISTORY_INDEX_KEY);
        return index || [];
    } catch (error) {
        console.error('[PasteHistoryService] Error listing history:', error);
        return [];
    }
}

/**
 * Add a new entry to paste history.
 * Silently skips if storage is not unlocked or text is empty.
 * @param {string} text - The pasted text
 * @returns {Promise<Object|null>} The new entry or null
 */
export async function addToHistory(text) {
    if (!EncryptedStorage.isUnlocked()) return null;
    if (!text || !text.trim()) return null;

    try {
        const index = await listHistory();
        const now = Date.now();

        const storedText = text.length > MAX_TEXT_LENGTH
            ? text.substring(0, MAX_TEXT_LENGTH)
            : text;

        // If this text already exists, move it to the top (preserve pin state)
        const existing = index.find(e => e.text === storedText);
        const withoutDupe = index.filter(e => e.text !== storedText);

        const entry = existing
            ? { ...existing, createdAt: now }
            : {
                id: `h-${now}-${Math.random().toString(36).substr(2, 6)}`,
                text: storedText,
                truncated: text.length > MAX_TEXT_LENGTH,
                createdAt: now,
                pinned: false,
            };

        // Pinned entries stay, unpinned entries are trimmed to MAX_HISTORY_ITEMS
        const pinned = withoutDupe.filter(e => e.pinned);
        const unpinned = withoutDupe.filter(e => !e.pinned);
        const trimmedUnpinned = (entry.pinned ? unpinned : [entry, ...unpinned]).slice(0, MAX_HISTORY_ITEMS - pinned.length);
        const newIndex = entry.pinned
            ? [...pinned.filter(e => e.id !== entry.id), entry, ...trimmedUnpinned]
            : [...pinned, ...trimmedUnpinned];

        await EncryptedStorage.saveBase64(HISTORY_CLIENT_ID, HISTORY_INDEX_KEY, newIndex);
        return entry;
    } catch (error) {
        console.error('[PasteHistoryService] Error adding to history:', error);
        return null;
    }
}

/**
 * Delete a single history entry by ID.
 * @param {string} id
 */
export async function deleteEntry(id) {
    if (!EncryptedStorage.isUnlocked()) return;
    try {
        const index = await listHistory();
        const updated = index.filter(e => e.id !== id);
        await EncryptedStorage.saveBase64(HISTORY_CLIENT_ID, HISTORY_INDEX_KEY, updated);
    } catch (error) {
        console.error('[PasteHistoryService] Error deleting entry:', error);
    }
}

/**
 * Toggle the pinned state of an entry.
 * @param {string} id
 * @returns {Promise<boolean>} The new pinned state
 */
export async function togglePin(id) {
    if (!EncryptedStorage.isUnlocked()) return false;
    try {
        const index = await listHistory();
        let newPinned = false;
        const updated = index.map(e => {
            if (e.id === id) {
                newPinned = !e.pinned;
                return { ...e, pinned: newPinned };
            }
            return e;
        });
        await EncryptedStorage.saveBase64(HISTORY_CLIENT_ID, HISTORY_INDEX_KEY, updated);
        return newPinned;
    } catch (error) {
        console.error('[PasteHistoryService] Error toggling pin:', error);
        return false;
    }
}

/**
 * Clear all unpinned history entries. Pinned entries are preserved.
 */
export async function clearHistory() {
    if (!EncryptedStorage.isUnlocked()) return;
    try {
        const index = await listHistory();
        const pinned = index.filter(e => e.pinned);
        await EncryptedStorage.saveBase64(HISTORY_CLIENT_ID, HISTORY_INDEX_KEY, pinned);
    } catch (error) {
        console.error('[PasteHistoryService] Error clearing history:', error);
    }
}
