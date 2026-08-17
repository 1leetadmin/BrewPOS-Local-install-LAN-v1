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

  const processCommand = useCallback((text) => {
    const items = menuItemsRef.current;
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

    if (lower.includes('clear') || lower.includes('cancel') || lower.includes('empty')) {
      onCommandRef.current({ type: 'clear_cart' });
      toast.info('Cart cleared');
      return;
    }
    if (lower.includes('checkout') || lower.includes('pay') || lower.includes('complete')) {
      onCommandRef.current({ type: 'checkout' });
      return;
    }

    const match = items.find(item => {
      const name = item.name.toLowerCase();
      return name === itemSearch || name.includes(itemSearch) || itemSearch.includes(name);
    });

    if (match) {
      const { modifiers, priceAdjustment } = parseVoiceModifiers(lower, match, modifierPresetsRef.current || []);
      onCommandRef.current({ type: 'add_item', item: match, quantity, modifiers, priceAdjustment, skipDialog: true });
      const modSummary = modifiers.length ? ` (${modifiers.map(m => m.option).join(', ')})` : '';
      toast.success(`Added ${quantity}x ${match.name}${modSummary}`);
    } else {
      toast.error(`"${itemSearch}" not found on menu`);
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
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      debugLog('onresult fired');
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
      if (final) {
        setLastText(final);
        setInterimText('');
        processCommand(final);
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