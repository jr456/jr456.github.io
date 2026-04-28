// Firestore data access. All reads/writes are scoped to one household
// document so the two users share state.
//
// Data model (under /households/{HID}):
//   catalogue/{normalizedName}  { name, section, addedBy, useCount, lastUsedAt }
//   stores/{storeId}            { name, createdAt }
//   lists/{listId}              { name, storeId, archived,
//                                 createdBy, createdAt,
//                                 updatedBy, updatedAt }
//   lists/{listId}/items/{id}   { name, normalized, section, note, done,
//                                 addedBy, addedAt, doneAt? }

import {
  db,
  collection, doc, setDoc, updateDoc, deleteDoc, addDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from "./firebase.js";
import { HOUSEHOLD_ID } from "./config.js";
import { normalizeName, suggestSection, titleCase } from "./sections.js";

const HH = () => doc(db, "households", HOUSEHOLD_ID);
const catalogueCol = () => collection(db, "households", HOUSEHOLD_ID, "catalogue");
const storesCol    = () => collection(db, "households", HOUSEHOLD_ID, "stores");
const listsCol     = () => collection(db, "households", HOUSEHOLD_ID, "lists");
const itemsCol     = (listId) => collection(db, "households", HOUSEHOLD_ID, "lists", listId, "items");

// ── Household bootstrap ────────────────────────────────────────────────────

export async function ensureHousehold(user) {
  const snap = await getDoc(HH());
  if (!snap.exists()) {
    await setDoc(HH(), {
      createdAt: serverTimestamp(),
      createdBy: user.email,
    });
  }
}

// ── Subscriptions ──────────────────────────────────────────────────────────

export function subscribeLists(cb) {
  const q = query(listsCol(), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeItems(listId, cb) {
  const q = query(itemsCol(listId), orderBy("addedAt", "asc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeCatalogue(cb) {
  const q = query(catalogueCol(), orderBy("name", "asc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeStores(cb) {
  const q = query(storesCol(), orderBy("name", "asc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ── Lists ──────────────────────────────────────────────────────────────────

const listRef = (listId) => doc(db, "households", HOUSEHOLD_ID, "lists", listId);

// Bumps updatedAt + updatedBy. Use after any mutation that should count as a
// list edit (item add/remove/check, rename, store change, clone-into, etc).
async function touchList(listId, user) {
  if (!listId || !user) return;
  await updateDoc(listRef(listId), {
    updatedAt: serverTimestamp(),
    updatedBy: user.email,
  }).catch(() => { /* list may not exist yet on first call; ignore */ });
}

export async function createList({ name, storeId }, user) {
  const ref = await addDoc(listsCol(), {
    name: name.trim(),
    storeId: storeId || null,
    archived: false,
    createdBy: user.email,
    createdAt: serverTimestamp(),
    updatedBy: user.email,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteList(listId) {
  // Wipe items first.
  const itemsSnap = await getDocs(itemsCol(listId));
  const batch = writeBatch(db);
  itemsSnap.forEach(d => batch.delete(d.ref));
  batch.delete(listRef(listId));
  await batch.commit();
}

export async function renameList(listId, name, user) {
  await updateDoc(listRef(listId), {
    name: name.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: user.email,
  });
}

export async function setListStore(listId, storeId, user) {
  await updateDoc(listRef(listId), {
    storeId: storeId || null,
    updatedAt: serverTimestamp(),
    updatedBy: user.email,
  });
}

export async function setListArchived(listId, archived, user) {
  await updateDoc(listRef(listId), {
    archived: !!archived,
    updatedAt: serverTimestamp(),
    updatedBy: user.email,
  });
}

// Copy items from one list into another. Cloned items always start unchecked
// and use the current user as `addedBy`. Catalogue is left untouched (these
// items already exist in it).
export async function cloneItems(targetListId, sourceItems, user) {
  if (!sourceItems.length) return 0;
  const batch = writeBatch(db);
  for (const it of sourceItems) {
    const ref = doc(itemsCol(targetListId));
    batch.set(ref, {
      name: it.name,
      normalized: it.normalized,
      section: it.section,
      note: it.note || "",
      done: false,
      addedBy: user.email,
      addedAt: serverTimestamp(),
    });
  }
  batch.update(listRef(targetListId), {
    updatedAt: serverTimestamp(),
    updatedBy: user.email,
  });
  await batch.commit();
  return sourceItems.length;
}

// One-shot fetch of every item in every list. Used by cross-list search.
export async function fetchAllItems(lists) {
  const out = [];
  await Promise.all(lists.map(async (list) => {
    const snap = await getDocs(itemsCol(list.id));
    for (const d of snap.docs) {
      out.push({ id: d.id, listId: list.id, listName: list.name, ...d.data() });
    }
  }));
  return out;
}

export async function clearCheckedItems(listId, items, user) {
  const batch = writeBatch(db);
  for (const it of items) {
    if (it.done) batch.delete(doc(itemsCol(listId), it.id));
  }
  await batch.commit();
  await touchList(listId, user);
}

// ── Items + catalogue ──────────────────────────────────────────────────────

// Add an item to a list. Also upserts the catalogue entry (or bumps usage).
export async function addItem(listId, rawName, user, opts = {}) {
  const normalized = normalizeName(rawName);
  if (!normalized) throw new Error("Item name is empty");

  // Look up existing catalogue entry (preserves user-chosen section).
  const catRef = doc(catalogueCol(), encodeKey(normalized));
  const catSnap = await getDoc(catRef);
  const displayName = catSnap.exists()
    ? catSnap.data().name
    : titleCase(normalized);
  const section = opts.section
    || (catSnap.exists() && catSnap.data().section)
    || suggestSection(normalized);

  await addDoc(itemsCol(listId), {
    name: displayName,
    normalized,
    section,
    note: opts.note || "",
    done: false,
    addedBy: user.email,
    addedAt: serverTimestamp(),
  });

  await setDoc(catRef, {
    name: displayName,
    normalized,
    section,
    addedBy: catSnap.exists() ? catSnap.data().addedBy : user.email,
    useCount: (catSnap.exists() ? (catSnap.data().useCount || 0) : 0) + 1,
    lastUsedAt: serverTimestamp(),
  }, { merge: true });

  await touchList(listId, user);

  return { name: displayName, section };
}

export async function updateItem(listId, itemId, patch, user) {
  await updateDoc(doc(itemsCol(listId), itemId), patch);
  await touchList(listId, user);
}

export async function setItemDone(listId, itemId, done, user) {
  await updateDoc(doc(itemsCol(listId), itemId), {
    done,
    doneAt: done ? serverTimestamp() : null,
  });
  await touchList(listId, user);
}

export async function deleteItem(listId, itemId, user) {
  await deleteDoc(doc(itemsCol(listId), itemId));
  await touchList(listId, user);
}

// Save a section change for an item, and propagate to the catalogue so future
// adds use the same section.
export async function setItemSection(listId, itemId, normalized, section, user) {
  const batch = writeBatch(db);
  batch.update(doc(itemsCol(listId), itemId), { section });
  batch.set(doc(catalogueCol(), encodeKey(normalized)), {
    section,
  }, { merge: true });
  await batch.commit();
  await touchList(listId, user);
}

// ── Catalogue ──────────────────────────────────────────────────────────────

export async function deleteCatalogueEntry(normalized) {
  await deleteDoc(doc(catalogueCol(), encodeKey(normalized)));
}

// ── Stores ─────────────────────────────────────────────────────────────────

export async function addStore(name, user) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Store name is empty");
  await addDoc(storesCol(), {
    name: trimmed,
    createdBy: user.email,
    createdAt: serverTimestamp(),
  });
}

export async function deleteStore(storeId) {
  await deleteDoc(doc(storesCol(), storeId));
}

// ── helpers ────────────────────────────────────────────────────────────────

// Firestore document IDs can't contain "/" and must be ≤1500 bytes.
function encodeKey(normalized) {
  return normalized.replace(/\//g, "_").slice(0, 1000) || "_";
}
