import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Same debug logging used in bluetoothPrinter.js — writes into the same
// %APPDATA%\BrewPOS Pilot\bluetooth-debug.log so both features' diagnostics
// land in one place.
function debugLog(message) {
  try {
    fetch('http://localhost:3001/api/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[voice] ${message}` }),
    }).catch(() => {});
  } catch { /* best effort */ }
}

// Normalize text for matching: lowercase + convert number words to digits
function normalizeForMatch(text) {
  const numWords = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
  let result = text.toLowerCase();
  for (const [word, digit] of Object.entries(numWords)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  }
  return result;
}

// Levenshtein edit distance, normalized to a 0-1 similarity score (1 = identical).
// Used as a fallback when exact/substring matching fails — catches near-miss
// transcriptions ("cappucino" vs "cappuccino", "flat wide" vs "flat white")
// that speech recognition commonly produces, without hardcoding specific
// mishearing pairs.
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist[rows - 1][cols - 1] / maxLen;
}

// Finds the best menu item match for a spoken item name. Tries exact
// equality first, then word-boundary matching (not raw substring — that
// lets short words accidentally match inside unrelated longer ones, e.g.
// "cola" inside "chocolate"), preferring the most specific/longest match
// among multiple hits (so "chai latte" matches "Chai Latte", not just
// "Latte"). Falls back to fuzzy similarity for near-miss transcriptions
// speech recognition commonly produces ("cappucino" vs "Cappuccino").
const FUZZY_MATCH_THRESHOLD = 0.72;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryIncludes(haystack, needle) {
  if (!needle) return false;
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(haystack);
}

function findBestMenuMatch(itemSearch, items) {
  if (!itemSearch) return null;

  const perfect = items.find((item) => item.name.toLowerCase() === itemSearch);
  if (perfect) return perfect;

  const candidates = items.filter((item) => {
    const name = item.name.toLowerCase();
    return wordBoundaryIncludes(itemSearch, name) || wordBoundaryIncludes(name, itemSearch);
  });
  if (candidates.length) {
    return candidates.reduce((longest, c) => (c.name.length > longest.name.length ? c : longest));
  }

  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const name = item.name.toLowerCase();
    const score = Math.max(similarity(itemSearch, name), ...name.split(' ').map((w) => similarity(itemSearch, w)));
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= FUZZY_MATCH_THRESHOLD ? best : null;
}

// Parse the voice text for modifier options that match the item's modifier groups.
// Returns { modifiers: [{ name, option, price_adjustment }], priceAdjustment: number }
function parseVoiceModifiers(voiceText, item, presets) {
  // Remove the item name from the voice text to avoid false matches
  const textWithoutItem = voiceText.replace(item.name.toLowerCase(), ' ');
  const normalized = normalizeForMatch(textWithoutItem);

  // Collect all modifier groups for this item (item-specific + preset-based)
  const groups = [];
  (item.modifiers || []).forEach(m => groups.push(m));
  (item.preset_ids || []).forEach(pid => {
    const preset = (presets || []).find(p => p.id === pid);
    (preset?.modifiers || []).forEach(m => groups.push(m));
  });

  const modifiers = [];
  let priceAdjustment = 0;

  for (const group of groups) {
    const isMulti = group.multi_select;
    for (const opt of group.options || []) {
      const labelNorm = normalizeForMatch(opt.label.toLowerCase());
      if (!labelNorm) continue;
      if (normalized.includes(labelNorm)) {
        modifiers.push({ name: group.name, option: opt.label, price_adjustment: opt.price_adjustment ?? 0 });
        priceAdjustment += opt.price_adjustment ?? 0;
        if (!isMulti) break;
      }
    }
  }

  return { modifiers, priceAdjustment };
}

export default function VoiceRecognition({ onCommand, menuItems, modifierPresets = [], enabled = true }) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lastText, setLastText] = useState('');

  // Keep latest refs so recognition callbacks always see fresh values
  const menuItemsRef = useRef(menuItems);
  const onCommandRef = useRef(onCommand);
  useEffect(() => { menuItemsRef.current = menuItems; }, [menuItems]);
  const modifierPresetsRef = useRef(modifierPresets);
  useEffect(() => { modifierPresetsRef.current = modifierPresets; }, [modifierPresets]);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);

  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);

  // Parses one transcript into { quantity, itemSearch, lower }.
  const parseTranscript = (text) => {
    const lower = text.toLowerCase().trim();
    const numWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

    let quantity = 1;
    let itemSearch = lower;

    const digitMatch = lower.match(/^(\d+)\s+(.+)/);
    const wordMatch = lower.match(/^(one|two|three|four|five|six|seven|eight|nine|ten)\s+(.+)/);
    if (digitMatch) {
      quantity = parseInt(digitMatch[1]) || 1;
      itemSearch = digitMatch[2];
    } else if (wordMatch) {
      quantity = numWords[wordMatch[1]] || 1;
      itemSearch = wordMatch[2];
    }

    itemSearch = itemSearch
      .replace(/^(please\s+)?(add|order|get|make|give me|i want|i('d| would) like|i'll have)\s+/i, '')
      .replace(/^(a|an|the)\s+/i, '')
      .trim();

    return { quantity, itemSearch, lower };
  };

  // Accepts either one transcript or several ranked alternatives from the
  // same utterance (Chrome's speech recognition returns multiple guesses
  // ranked by confidence — previously only the top one was ever tried, so
  // a mis-heard top guess meant a silent failure even when a lower-ranked
  // alternative was actually correct). Tries each in order; the first one
  // that resolves to a real menu item wins.
  const processCommand = useCallback((transcripts) => {
    const items = menuItemsRef.current;
    const alternatives = Array.isArray(transcripts) ? transcripts : [transcripts];
    const parsed = alternatives.map(parseTranscript);

    if (parsed.some((p) => p.lower.includes('clear') || p.lower.includes('cancel') || p.lower.includes('empty'))) {
      onCommandRef.current({ type: 'clear_cart' });
      toast.info('Cart cleared');
      return;
    }
    if (parsed.some((p) => p.lower.includes('checkout') || p.lower.includes('pay') || p.lower.includes('complete'))) {
      onCommandRef.current({ type: 'checkout' });
      return;
    }

    let match = null;
    let matchedParse = parsed[0];
    for (const p of parsed) {
      match = findBestMenuMatch(p.itemSearch, items);
      if (match) { matchedParse = p; break; }
    }

    if (match) {
      const { quantity, lower } = matchedParse;
      const { modifiers, priceAdjustment } = parseVoiceModifiers(lower, match, modifierPresetsRef.current || []);
      onCommandRef.current({ type: 'add_item', item: match, quantity, modifiers, priceAdjustment, skipDialog: true });
      const modSummary = modifiers.length ? ` (${modifiers.map(m => m.option).join(', ')})` : '';
      toast.success(`Added ${quantity}x ${match.name}${modSummary}`);
    } else {
      toast.error(`"${parsed[0].itemSearch}" not found on menu`);
    }
  }, []);

  // Build recognition ONCE on mount
  useEffect(() => {
    if (!enabled) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    debugLog(`SpeechRecognition constructor available: ${!!SpeechRecognition}`);
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    // Ask for multiple ranked guesses per utterance instead of just one —
    // processCommand now tries each in order, so a mis-heard top guess no
    // longer means an automatic failure if a lower-ranked alternative was
    // actually right.
    recognition.maxAlternatives = 5;

    recognition.onresult = (event) => {
      debugLog('onresult fired');
      let interim = '';
      let finalAlternatives = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          for (let j = 0; j < event.results[i].length; j++) {
            finalAlternatives.push(event.results[i][j].transcript);
          }
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
      if (finalAlternatives.length) {
        debugLog(`alternatives: ${JSON.stringify(finalAlternatives)}`);
        setLastText(finalAlternatives[0]);
        setInterimText('');
        processCommand(finalAlternatives);
      }
    };

    recognition.onend = () => {
      debugLog('onend fired');
      isListeningRef.current = false;
      setIsListening(false);
      setInterimText('');
    };

    recognition.onerror = (event) => {
      debugLog(`onerror fired: ${event.error}`);
      if (event.error === 'no-speech') return; // silent — user just didn't speak
      if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow mic permissions in your browser.');
      } else {
        toast.error(`Voice error: ${event.error}`);
      }
      isListeningRef.current = false;
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.abort(); } catch (_) {}
    };
  }, [enabled, processCommand]);

  const toggleListening = () => {
    const recognition = recognitionRef.current;

    if (!recognition) {
      debugLog('toggleListening: no recognition instance (SpeechRecognition unsupported)');
      toast.error('Voice recognition not supported. Use Chrome on desktop.');
      return;
    }

    if (isListeningRef.current) {
      debugLog('toggleListening: stopping');
      try { recognition.stop(); } catch (_) {}
      isListeningRef.current = false;
      setIsListening(false);
    } else {
      debugLog('toggleListening: calling recognition.start()');
      setLastText('');
      setInterimText('');
      try {
        recognition.start();
        isListeningRef.current = true;
        setIsListening(true);
      } catch (err) {
        // Already started — abort and retry
        try { recognition.abort(); } catch (_) {}
        setTimeout(() => {
          try {
            recognition.start();
            isListeningRef.current = true;
            setIsListening(true);
          } catch (e) {
            toast.error('Could not start microphone: ' + e.message);
          }
        }, 300);
      }
    }
  };

  if (!enabled) return null;

  const displayText = interimText || lastText;

  return (
    <div className="flex items-center gap-3">
      {displayText && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg max-w-[220px]">
          <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className={cn("text-xs truncate", interimText ? "text-muted-foreground italic" : "text-foreground")}>
            {displayText}
          </span>
        </div>
      )}
      <Button
        variant={isListening ? "default" : "outline"}
        size="icon"
        onClick={toggleListening}
        title={isListening ? 'Stop listening' : 'Start voice input'}
        className={cn(
          "h-10 w-10 rounded-full transition-all shrink-0",
          isListening && "voice-active bg-primary text-primary-foreground"
        )}
      >
        {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>
    </div>
  );
}