// ──────────────────────────────────────────────────────────────────────────
// Firebase + access config — fill in before deploying. See README.md.
// ──────────────────────────────────────────────────────────────────────────

// Paste the Firebase web config object from
//   Firebase console → Project settings → Your apps → Web app → SDK setup.
// These values are public (security comes from Firestore rules + auth allowlist).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCIkejfPkLOHDYsdwFgpMc603_hqmXkIkw",
  authDomain: "shopping-list-1e116.firebaseapp.com",
  projectId: "shopping-list-1e116",
  storageBucket: "shopping-list-1e116.firebasestorage.app",
  messagingSenderId: "353359527819",
  appId: "1:353359527819:web:9e4e68a1f8f99475c2798e",
  measurementId: "G-CCYNYVL3FT"

};

// Lowercased Google account emails allowed to sign in. Anyone else gets
// signed straight back out.
export const ALLOWED_EMAILS = [
  "you@example.com",
  "wife@example.com",
];

// All authorized users share one household document. Pick any string; both
// users just need to use the same one.
export const HOUSEHOLD_ID = "default";
