// ──────────────────────────────────────────────────────────────────────────
// Firebase + access config — fill in before deploying. See README.md.
// ──────────────────────────────────────────────────────────────────────────

// Paste the Firebase web config object from
//   Firebase console → Project settings → Your apps → Web app → SDK setup.
// These values are public (security comes from Firestore rules + auth allowlist).
export const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
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
