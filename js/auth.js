import {
  auth, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged,
} from "./firebase.js";
import { ALLOWED_EMAILS } from "./config.js";

const allowed = new Set(ALLOWED_EMAILS.map(e => e.toLowerCase()));

export function isAllowed(user) {
  return !!user && !!user.email && allowed.has(user.email.toLowerCase());
}

export function watchAuth(onChange) {
  return onAuthStateChanged(auth, async (user) => {
    if (user && !isAllowed(user)) {
      // Reject and sign out unauthorized accounts immediately.
      await signOut(auth);
      onChange(null, { reason: "not-allowed", email: user.email });
      return;
    }
    onChange(user || null, null);
  });
}

export async function signIn() {
  const result = await signInWithPopup(auth, googleProvider);
  if (!isAllowed(result.user)) {
    await signOut(auth);
    const err = new Error(`${result.user.email} is not authorized.`);
    err.code = "not-allowed";
    throw err;
  }
  return result.user;
}

export async function signOutCurrent() {
  await signOut(auth);
}
