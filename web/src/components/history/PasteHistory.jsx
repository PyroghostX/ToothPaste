import React, { useState, useEffect, useCallback } from 'react';
import { Typography } from '@material-tailwind/react';
import {
    MagnifyingGlassIcon,
    TrashIcon,
    PaperAirplaneIcon,
    LockClosedIcon,
    BookmarkIcon,
    ClockIcon,
    CommandLineIcon,
    ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/24/solid';
import * as PasteHistoryService from '../../services/history/PasteHistoryService';
import * as EncryptedStorage from '../../services/localSecurity/EncryptedStorage';

function relativeTime(ts) {
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'Just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
}

const COMMAND_ENTRIES = [
    { id: 'command-tab', label: 'Tab', key: 'Tab' },
    { id: 'command-enter', label: 'Enter', key: 'Enter' },
];

const APPEND_KEY_OPTIONS = [
    { label: 'No key', value: '' },
    { label: 'Tab', value: 'Tab' },
    { label: 'Enter', value: 'Enter' },
];

function HistoryEntry({ entry, onResend, onLoadForEdit, onDelete, onTogglePin }) {
    const [appendKey, setAppendKey] = useState('');
    const preview = entry.text.length > 120
        ? entry.text.substring(0, 120) + '…'
        : entry.text;

    return (
        <div className="flex items-start gap-2 p-3 rounded bg-ink hover:bg-ash transition-colors">
            {/* Text area: tap to load for editing (no send) */}
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onLoadForEdit(entry.text)}>
                <Typography type="small" className="text-text break-words whitespace-pre-wrap leading-snug">
                    {preview}
                </Typography>
                <div className="flex items-center gap-1 mt-1">
                    <ClockIcon className="h-3 w-3 text-dust opacity-60" />
                    <Typography type="small" className="text-dust opacity-60 text-xs">
                        {relativeTime(entry.createdAt)}
                        {entry.truncated && ' · truncated'}
                    </Typography>
                </div>
            </div>

            {/* Action buttons — always visible, larger for phone */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    title={entry.pinned ? 'Unpin' : 'Pin'}
                    onClick={() => onTogglePin(entry.id)}
                    className="p-2 rounded hover:bg-background"
                >
                    {entry.pinned
                        ? <BookmarkIconSolid className="h-6 w-6 text-primary" />
                        : <BookmarkIcon className="h-6 w-6 text-text" />
                    }
                </button>
                <label className="relative flex items-center">
                    <span className="sr-only">Append key</span>
                    <select
                        title="Append key after send"
                        value={appendKey}
                        onChange={(event) => setAppendKey(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        className="h-10 max-w-[5.5rem] appearance-none rounded border border-ash bg-background py-1 pl-2 pr-7 text-xs text-text outline-none transition-colors hover:border-primary focus:border-primary"
                    >
                        {APPEND_KEY_OPTIONS.map(option => (
                            <option key={option.value || 'none'} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-dust" />
                </label>
                <button
                    title={appendKey ? `Send and append ${appendKey}` : 'Send (stay on history)'}
                    onClick={() => onResend(entry.text, appendKey)}
                    className="p-2 rounded hover:bg-background"
                >
                    <PaperAirplaneIcon className="h-6 w-6 text-text" />
                </button>
                <button
                    title="Delete"
                    onClick={() => onDelete(entry.id)}
                    className="p-2 rounded hover:bg-background"
                >
                    <TrashIcon className="h-6 w-6 text-text" />
                </button>
            </div>
        </div>
    );
}

function CommandButton({ entry, onSendSpecialKey }) {
    return (
        <button
            title={`Send ${entry.label}`}
            onClick={() => onSendSpecialKey(entry.key)}
            className="flex min-w-0 items-center justify-between gap-2 rounded bg-ink p-3 text-left transition-colors hover:bg-ash"
        >
            <div className="flex min-w-0 items-center gap-2">
                <CommandLineIcon className="h-4 w-4 shrink-0 text-dust" />
                <Typography type="small" className="truncate text-text font-semibold">
                    {entry.label}
                </Typography>
            </div>
            <PaperAirplaneIcon className="h-5 w-5 shrink-0 text-text" />
        </button>
    );
}

export default function PasteHistory({ onResend, onLoadForEdit, onSendSpecialKey, refreshKey = 0 }) {
    const [history, setHistory] = useState([]);
    const [search, setSearch] = useState('');
    const [isUnlocked, setIsUnlocked] = useState(EncryptedStorage.isUnlocked());

    const reload = useCallback(async () => {
        const entries = await PasteHistoryService.listHistory();
        const pinned = entries.filter(e => e.pinned).sort((a, b) => b.createdAt - a.createdAt);
        const unpinned = entries.filter(e => !e.pinned).sort((a, b) => b.createdAt - a.createdAt);
        setHistory([...pinned, ...unpinned]);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = EncryptedStorage.isUnlocked();
            if (now !== isUnlocked) {
                setIsUnlocked(now);
                if (now) reload();
            }
        }, 500);
        return () => clearInterval(interval);
    }, [isUnlocked, reload]);

    useEffect(() => {
        if (isUnlocked) reload();
    }, [isUnlocked, reload, refreshKey]);

    const handleDelete = useCallback(async (id) => {
        await PasteHistoryService.deleteEntry(id);
        reload();
    }, [reload]);

    const handleTogglePin = useCallback(async (id) => {
        await PasteHistoryService.togglePin(id);
        reload();
    }, [reload]);

    const handleClear = useCallback(async () => {
        await PasteHistoryService.clearHistory();
        reload();
    }, [reload]);

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
        ? history.filter(e => e.text.toLowerCase().includes(normalizedSearch))
        : history;

    const pinnedCount = filtered.filter(e => e.pinned).length;
    const unpinnedCount = filtered.filter(e => !e.pinned).length;

    if (!isUnlocked) {
        return (
            <div className="flex flex-col flex-1 items-center justify-center gap-2">
                <LockClosedIcon className="h-8 w-8 text-dust" />
                <Typography type="h6" className="text-dust font-semibold">Storage is Locked</Typography>
                <Typography type="small" className="text-dust/70">
                    Unlock in the Authentication tab to access history
                </Typography>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 gap-3 min-h-0">
            {/* Commands */}
            <div className="grid grid-cols-2 gap-2">
                {COMMAND_ENTRIES.map(entry => (
                    <CommandButton
                        key={entry.id}
                        entry={entry}
                        onSendSpecialKey={onSendSpecialKey}
                    />
                ))}
            </div>

            {/* Search */}
            <div className="relative">
                <MagnifyingGlassIcon className="h-4 w-4 text-dust absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Search history…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-ink border border-ash rounded px-3 py-2 pl-9 text-text text-sm outline-none focus:border-primary placeholder:text-dust/60"
                />
            </div>

            {/* List */}
            <div className="flex flex-col flex-1 gap-1 overflow-y-auto min-h-0">
                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2 opacity-50">
                        <ClockIcon className="h-8 w-8 text-dust" />
                        <Typography type="small" className="text-dust">
                            {search ? 'No matches found' : 'No history yet — sent pastes will appear here'}
                        </Typography>
                    </div>
                )}

                {pinnedCount > 0 && (
                    <Typography type="small" className="text-dust/60 text-xs px-1 pt-1">Pinned</Typography>
                )}
                {filtered.filter(e => e.pinned).map(entry => (
                    <HistoryEntry
                        key={entry.id}
                        entry={entry}
                        onResend={onResend}
                        onLoadForEdit={onLoadForEdit}
                        onDelete={handleDelete}
                        onTogglePin={handleTogglePin}
                    />
                ))}

                {pinnedCount > 0 && unpinnedCount > 0 && (
                    <Typography type="small" className="text-dust/60 text-xs px-1 pt-2">Recent</Typography>
                )}
                {filtered.filter(e => !e.pinned).map(entry => (
                    <HistoryEntry
                        key={entry.id}
                        entry={entry}
                        onResend={onResend}
                        onLoadForEdit={onLoadForEdit}
                        onDelete={handleDelete}
                        onTogglePin={handleTogglePin}
                    />
                ))}
            </div>

            {/* Footer */}
            {history.filter(e => !e.pinned).length > 0 && (
                <button
                    onClick={handleClear}
                    className="text-xs text-dust/60 hover:text-dust transition-colors self-end pb-1"
                >
                    Clear unpinned history
                </button>
            )}
        </div>
    );
}
