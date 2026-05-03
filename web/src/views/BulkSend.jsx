import React, { useState, useContext, useRef, useEffect, useCallback } from 'react';
import { Button, Typography, Tabs } from "@material-tailwind/react";
import { Textarea } from "@material-tailwind/react";
import { BLEContext } from '../context/BLEContext';
import {
    ClipboardIcon,
    InformationCircleIcon,
    SparklesIcon,
    LockClosedIcon,
    ClockIcon,
} from "@heroicons/react/24/outline";
import { keyboardHandler } from '../services/inputHandlers/keyboardHandler';
import DuckyscriptEditor from '../components/duckyscript/DuckyscriptEditor';
import { parseDuckyscript, executeDuckyscript } from '../services/duckyscript/DuckyscriptParser';
import { DuckyscriptContext } from '../context/DuckyscriptContext';
import PasteHistory from '../components/history/PasteHistory';
import { addToHistory } from '../services/history/PasteHistoryService';

const SPEED_OPTIONS = [
    { label: 'Fast',   slowMode: false, chunkDelayMs: 0,   hint: '5ms/char – fastest, may miss chars on some devices' },
    { label: 'Normal', slowMode: true,  chunkDelayMs: 0,   hint: '12ms/char – reliable for most devices' },
    { label: 'Slow',   slowMode: true,  chunkDelayMs: 100, hint: '12ms/char + 100ms between chunks – for BIOS/KVM/slow hosts' },
];

const SPEED_STORAGE_KEY = 'toothpaste-speed';
const APPEND_KEY_TEXT = {
    Tab: '\t',
    TabTab: '\t\t',
    Enter: '\n',
};

function loadSavedSpeed() {
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    return SPEED_OPTIONS.find(o => o.label === saved) ?? SPEED_OPTIONS[1]; // default: Normal
}

export default function BulkSend() {
    const [input, setInput] = useState('');
    const [selectedScript, setSelectedScript] = useState(null);
    const [speed, setSpeed] = useState(loadSavedSpeed);
    const [activeTab, setActiveTab] = useState('text');
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
    const { status, sendEncrypted } = useContext(BLEContext);
    const { isUnlocked, scripts } = useContext(DuckyscriptContext);
    const editorRef = useRef(null);

    const handleSpeedChange = useCallback((opt) => {
        setSpeed(opt);
        localStorage.setItem(SPEED_STORAGE_KEY, opt.label);
    }, []);

    const sendString = useCallback(async (textOverride) => {
        const text = textOverride !== undefined ? textOverride : input;
        if (!text) return;
        try {
            await keyboardHandler.sendKeyboardString(text, sendEncrypted, speed.chunkDelayMs, speed.slowMode);
            if (textOverride === undefined) {
                // Only save to history when sending from the textarea (not resending from history)
                await addToHistory(text);
                setHistoryRefreshKey(key => key + 1);
            }
        } catch (error) {
            console.error(error);
        }
    }, [input, sendEncrypted, speed]);

    // Send from history and stay on history tab
    const handleResend = useCallback(async (text, appendKey = '') => {
        try {
            const textToSend = `${text}${APPEND_KEY_TEXT[appendKey] ?? ''}`;
            await keyboardHandler.sendKeyboardString(textToSend, sendEncrypted, speed.chunkDelayMs, speed.slowMode);
            await addToHistory(text);
            setHistoryRefreshKey(key => key + 1);
        } catch (error) {
            console.error(error);
        }
    }, [sendEncrypted, speed]);

    const handleSendSpecialKey = useCallback((key) => {
        keyboardHandler.sendSpecialKey(key, [], sendEncrypted);
    }, [sendEncrypted]);

    // Load into textarea and switch to text tab (no send)
    const handleLoadForEdit = useCallback((text) => {
        setInput(text);
        setActiveTab('text');
    }, []);

    const sendDuckyscript = useCallback(async () => {
        if (!selectedScript) return;
        try {
            console.log('[BulkSend] Executing duckyscript:', selectedScript.name);
            const parseResult = parseDuckyscript(selectedScript.content);
            if (!parseResult.isValid) {
                console.error('[BulkSend] Script has parse errors:', parseResult.errors);
                alert('Script has errors:\n' + parseResult.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n'));
                return;
            }
            const delayFn = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const sendStringFn = async (text) => {
                return keyboardHandler.sendKeyboardString(text, sendEncrypted, speed.chunkDelayMs, speed.slowMode);
            };
            await executeDuckyscript(parseResult.ast, sendStringFn, delayFn);
        } catch (error) {
            console.error('[BulkSend] Duckyscript execution error:', error);
            alert('Error executing script: ' + error.message);
        }
    }, [selectedScript, sendEncrypted, speed]);

    const handleShortcut = useCallback((event) => {
        const isCtrl = event.ctrlKey || event.metaKey;
        const isAlt = event.altKey;
        const isEnter = event.key === "Enter";

        if (isCtrl && isAlt && isEnter) {
            event.preventDefault();
            event.stopPropagation();
            sendString();
        } else if (isCtrl && isAlt && !["Control", "Alt"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            const keySequence = event.key === "Backspace" ? ["Control", "Backspace"] : ["Control", event.key];
            keyboardHandler.sendKeyboardShortcut(keySequence, sendEncrypted);
        }
    }, [sendString, sendEncrypted]);

    useEffect(() => {
        const keyListener = (e) => handleShortcut(e);
        window.addEventListener("keydown", keyListener);
        return () => window.removeEventListener("keydown", keyListener);
    }, [handleShortcut]);

    const sendComposer = (
        <div className="flex flex-col flex-1 gap-4 overflow-y-auto min-h-0">
            <Textarea
                className={`min-h-[11rem] h-[28vh] max-h-[20rem] resize-none bg-ink border-2 focus:border-ash outline-none text-text font-body
                    ${status===1?'hover:border-primary border-primary':'hover:border-secondary border-secondary'} `}
                ref={editorRef}
                value={input}
                placeholder="Type or paste text here..."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleShortcut}
            />

            {/* Typing speed control */}
            <div className="flex items-center gap-3">
                <Typography type="small" className="text-dust shrink-0">Speed:</Typography>
                <div className="flex gap-2">
                    {SPEED_OPTIONS.map(opt => (
                        <button
                            key={opt.label}
                            title={opt.hint}
                            onClick={() => handleSpeedChange(opt)}
                            className={`px-3 py-1 rounded text-sm border transition-colors
                                ${speed.label === opt.label
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-ash text-dust hover:border-text hover:text-text'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex text-text">
                <InformationCircleIcon className="h-4 w-4 mr-2 stroke-2 shrink-0" />
                <Typography type="small">
                    Press Ctrl+Alt+Enter to send, or click the button below. Use Normal/Slow speed if characters are missed.
                </Typography>
            </div>

            <div className="hidden md:block rounded-2xl border border-ash/70 bg-ink/95 p-3 shadow-2xl">
                <Button
                    onClick={() => sendString()}
                    disabled={status !== 1}
                    className='w-full bg-primary disabled:bg-ash disabled:border-secondary text-text active:bg-primary-active flex items-center justify-center size-lg'>
                    <ClipboardIcon className="h-7 w-7 mr-4" />
                    <Typography type="h5" className="text-text font-header normal-case font-semibold">Paste to Device</Typography>
                </Button>
            </div>
        </div>
    );

    const historyPanel = (
        <PasteHistory
            onResend={handleResend}
            onLoadForEdit={handleLoadForEdit}
            onSendSpecialKey={handleSendSpecialKey}
            refreshKey={historyRefreshKey}
        />
    );

    return (
        <div className="flex flex-col flex-1 w-full p-4 md:p-6 bg-transparent text-text z-10">
            <div id="bulk-send-container" className="flex flex-col flex-1 mt-5">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
                    <Tabs.List className="w-full bg-ink rounded-lg p-1">
                        <Tabs.Trigger className="w-full text-text data-[state=active]:text-text" value="text">
                            <div className="flex items-center gap-2">
                                <ClipboardIcon className="h-4 w-4" />
                                Text
                            </div>
                        </Tabs.Trigger>
                        <Tabs.Trigger className="w-full text-text data-[state=active]:text-text md:hidden" value="history">
                            <div className="flex items-center gap-2">
                                <ClockIcon className="h-4 w-4" />
                                History
                            </div>
                        </Tabs.Trigger>
                        <Tabs.Trigger className="w-full text-text data-[state=active]:text-text" value="duckyscript">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="h-4 w-4" />
                                Duckyscript
                            </div>
                        </Tabs.Trigger>
                        <Tabs.TriggerIndicator className="bg-ash rounded" />
                    </Tabs.List>

                    {/* Text Tab */}
                    <Tabs.Panel value="text" className="flex flex-col flex-1 gap-4 min-h-0 pb-28 md:pb-0">
                        <div className="flex flex-col flex-1 gap-4 min-h-0 md:grid md:grid-cols-2 md:items-start">
                            <div className="flex flex-col min-h-0 md:h-[calc(100vh-14rem)]">
                                {sendComposer}
                            </div>
                            <div className="hidden md:flex md:flex-col md:min-h-0 md:h-[calc(100vh-14rem)]">
                                {historyPanel}
                            </div>
                        </div>
                    </Tabs.Panel>

                    {/* History Tab */}
                    <Tabs.Panel value="history" className="flex flex-col flex-1 gap-4 min-h-0 md:hidden">
                        {historyPanel}
                    </Tabs.Panel>

                    {/* Duckyscript Tab */}
                    <Tabs.Panel value="duckyscript" className="flex flex-col flex-1 gap-4 relative">
                        {!isUnlocked && (
                            <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center z-50 backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-2">
                                    <LockClosedIcon className="h-8 w-8 text-dust" />
                                    <Typography type="h6" className="text-dust font-semibold">
                                        Storage is Locked
                                    </Typography>
                                    <Typography type="small" className="text-dust/70">
                                        Unlock in the Authentication tab to access duckyscripts
                                    </Typography>
                                </div>
                            </div>
                        )}
                        <div className={`flex flex-col flex-1 gap-4 min-h-0 ${isUnlocked ? '' : 'pointer-events-none opacity-50'}`}>
                            <div className="flex text-orange">
                                <InformationCircleIcon className="h-4 w-4 mr-2 stroke-2" />
                                <Typography type="small">
                                    The DuckyScript module is a work-in-progress. Features might not be fully functional.
                                </Typography>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">
                                <DuckyscriptEditor onScriptSelected={setSelectedScript} />
                            </div>

                            {selectedScript && (
                                <div className="bg-ash rounded p-3 flex flex-col gap-3">
                                    <div>
                                        <Typography type="small" className="text-dust font-semibold mr-4">
                                            Selected Script: {selectedScript.name}
                                        </Typography>
                                        <Typography type="small" className="text-text">
                                            Lines: {selectedScript.lineCount} | Est. Time: {Math.round(selectedScript.estimatedTime)}ms
                                        </Typography>
                                    </div>
                                    <Button
                                        onClick={sendDuckyscript}
                                        disabled={status !== 1 || !isUnlocked}
                                        className='bg-primary disabled:bg-ash disabled:border-secondary text-text active:bg-primary-active flex items-center justify-center size-lg'>
                                        <SparklesIcon className="h-7 w-7 mr-4" />
                                        <Typography type="h5" className="text-text font-header normal-case font-semibold">Execute Script</Typography>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </Tabs.Panel>
                </Tabs>
            </div>

            {activeTab === 'text' && (
                <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:hidden">
                    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-ash/70 bg-ink/95 p-3 shadow-2xl backdrop-blur">
                        <Button
                            onClick={() => sendString()}
                            disabled={status !== 1}
                            className='w-full bg-primary disabled:bg-ash disabled:border-secondary text-text active:bg-primary-active flex items-center justify-center size-lg'>
                            <ClipboardIcon className="h-7 w-7 mr-4" />
                            <Typography type="h5" className="text-text font-header normal-case font-semibold">Paste to Device</Typography>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
