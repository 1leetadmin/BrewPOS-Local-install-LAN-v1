// ============================================================================
// src/components/pos/VoiceRecognition.jsx
//
// Voice recognition is disabled in this build. It relies on the Web Speech
// API, which needs an internet-connected, Google-authorized browser to
// actually work — real Chrome has that authorization, Electron's bundled
// browser engine does not, regardless of any flags or permissions set here.
// Confirmed directly: comparing this exact same component's code (character
// for character) against a working browser-based build of BrewPOS — same
// code works there because it opens in real Chrome, not Electron's window.
//
// Rather than show a mic button that looks clickable but silently does
// nothing, this build doesn't render it at all.
//
// The full implementation (wake word, Web Speech setup, command parsing)
// is preserved in this file's git history if BrewPOS ever moves off
// rendering its UI inside Electron's own window (e.g. opening it in the
// system's real browser instead — see the "hybrid" option discussed
// 2026-08-17) and voice becomes viable again.
//
// PROTECTED file — never touched by a Base44 export sync.
// ============================================================================

export default function VoiceRecognition() {
  return null;
}
