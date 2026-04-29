// Top-level UI controller. Subscribes to Firestore, renders into the DOM,
// wires events.

import { signIn, signOutCurrent, watchAuth } from "./auth.js";
import {
  ensureHousehold,
  subscribeLists, subscribeItems, subscribeCatalogue, subscribeStores,
  subscribeSections, upsertSection, deleteSectionDoc, reorderSections,
  createList, deleteList, renameList, setListStore, setListArchived,
  clearCheckedItems,
  addItem, updateItem, setItemDone, deleteItem, setItemSection,
  deleteCatalogueEntry,
  addStore, deleteStore,
  cloneItems, fetchAllItems,
} from "./db.js";
import {
  SECTIONS as DEFAULT_SECTIONS,
  SECTIONS_BY_ID as DEFAULT_SECTIONS_BY_ID,
  suggestSection, normalizeName,
} from "./sections.js";

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  user: null,
  lists: [],
  activeListId: null,
  items: [],
  catalogue: [],
  stores: [],
  catalogueIndex: new Map(), // normalized → catalogue entry
  sectionOverrides: [],   // raw docs from Firestore
  sections: [],           // merged + ordered sections (active source of truth)
  sectionsById: new Map(),
  unsubs: [],
  currentTab: "list",
  showArchived: false,
  // User-overridden open/closed state for sections in the active list.
  // Map<`${listId}:${sectionId}`, boolean>. Cleared when active list changes.
  sectionOpen: new Map(),
  // Cross-list search cache.
  allItems: [],
  searchQuery: "",
  searchLoading: false,
};

// ── Bootstrap ──────────────────────────────────────────────────────────────

watchAuth(async (user, err) => {
  if (err?.reason === "not-allowed") {
    showAuthError(`${err.email} is not on the allowlist.`);
  }
  state.user = user;
  if (user) {
    showApp(user);
    try {
      await ensureHousehold(user);
    } catch (e) {
      console.error(e);
      showAuthError("Could not access database. Check Firestore rules.");
      return;
    }
    startSubscriptions();
  } else {
    teardownSubscriptions();
    showAuth();
  }
});

document.getElementById("signin").addEventListener("click", async () => {
  hideAuthError();
  try {
    await signIn();
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user") return;
    showAuthError(e.message || String(e));
  }
});

document.getElementById("signout").addEventListener("click", () => {
  signOutCurrent();
});

// ── Auth views ─────────────────────────────────────────────────────────────

function showAuth() {
  document.getElementById("topbar").hidden = true;
  setView("auth-view");
}
function showApp(user) {
  document.getElementById("topbar").hidden = false;
  const avatar = document.getElementById("user-avatar");
  if (user.photoURL) {
    avatar.src = user.photoURL;
    avatar.alt = user.displayName || user.email;
  } else {
    avatar.removeAttribute("src");
    avatar.alt = "";
  }
  switchTab(state.currentTab);
}
function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.hidden = false;
}
function hideAuthError() {
  document.getElementById("auth-error").hidden = true;
}

function setView(id) {
  for (const v of document.querySelectorAll(".view")) {
    v.classList.toggle("active", v.id === id);
    v.hidden = v.id !== id;
  }
}

// ── Tabs ───────────────────────────────────────────────────────────────────

for (const btn of document.querySelectorAll(".tab")) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}

function switchTab(name) {
  state.currentTab = name;
  for (const t of document.querySelectorAll(".tab")) {
    t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false");
  }
  setView(({
    list: "list-view",
    search: "search-view",
    catalogue: "catalogue-view",
    categories: "categories-view",
    stores: "stores-view",
  })[name]);
  if (name === "search") {
    refreshSearchData(true);
    setTimeout(() => document.getElementById("search-input")?.focus(), 0);
  }
}

// ── Subscriptions ──────────────────────────────────────────────────────────

function startSubscriptions() {
  teardownSubscriptions();

  state.unsubs.push(subscribeLists((lists) => {
    state.lists = lists;
    if (lists.length === 0) {
      // Seed first list automatically.
      createList({ name: "Shopping list" }, state.user).catch(console.error);
      return;
    }
    // If the active list is gone or archived (and we're not showing archived),
    // jump to the first visible one.
    const visible = visibleLists();
    const active = lists.find(l => l.id === state.activeListId);
    if (!active || (active.archived && !state.showArchived)) {
      if (active?.archived) state.showArchived = true; // reveal linked archived list
      state.activeListId = active?.id || visible[0]?.id || lists[0].id;
      resubscribeItems();
    }
    renderListPicker();
    renderListHeader();
  }));

  state.unsubs.push(subscribeCatalogue((cat) => {
    state.catalogue = cat;
    state.catalogueIndex = new Map(cat.map(c => [c.normalized, c]));
    renderCatalogue();
    renderSuggestions();
  }));

  state.unsubs.push(subscribeStores((stores) => {
    state.stores = stores;
    renderStores();
    renderStoreOptions();
    renderListHeader();
  }));

  state.unsubs.push(subscribeSections((overrides) => {
    state.sectionOverrides = overrides;
    rebuildSections();
    renderItems();
    renderCategories();
    renderItemSectionOptions();
  }));
}

// Merge built-in defaults with Firestore overrides into a single ordered list.
// Override doc IDs that match a built-in ID replace that built-in's name/icon/order.
// Override docs with custom: true are new sections appended to the list.
function rebuildSections() {
  const overrideMap = new Map(state.sectionOverrides.map(o => [o.id, o]));
  const merged = [];
  for (const def of DEFAULT_SECTIONS) {
    const ov = overrideMap.get(def.id);
    merged.push({
      id: def.id,
      name: ov?.name ?? def.name,
      icon: ov?.icon ?? def.icon,
      order: ov?.order ?? def.order,
      custom: false,
    });
    overrideMap.delete(def.id);
  }
  for (const ov of overrideMap.values()) {
    if (!ov.custom) continue; // stray override with no matching built-in; ignore
    merged.push({
      id: ov.id,
      name: ov.name || "Untitled",
      icon: ov.icon || "🛍️",
      order: ov.order ?? 1000,
      custom: true,
    });
  }
  merged.sort((a, b) => a.order - b.order);
  state.sections = merged;
  state.sectionsById = new Map(merged.map(s => [s.id, s]));
}

// Initial population so anything rendering before the first snapshot fires
// still has section data to lean on.
rebuildSections();

function getSection(id) {
  return state.sectionsById.get(id)
      || state.sectionsById.get("other")
      || DEFAULT_SECTIONS_BY_ID.other;
}

let unsubItems = null;
function resubscribeItems() {
  if (unsubItems) { unsubItems(); unsubItems = null; }
  if (!state.activeListId) return;
  unsubItems = subscribeItems(state.activeListId, (items) => {
    state.items = items;
    renderItems();
    renderCatalogue();
  });
}

function teardownSubscriptions() {
  for (const u of state.unsubs) u();
  state.unsubs = [];
  if (unsubItems) { unsubItems(); unsubItems = null; }
  state.lists = []; state.items = []; state.catalogue = []; state.stores = [];
  state.activeListId = null;
}

// ── List picker / header ───────────────────────────────────────────────────

const listPicker = document.getElementById("list-picker");
listPicker.addEventListener("change", () => {
  state.activeListId = listPicker.value;
  state.sectionOpen.clear();
  resubscribeItems();
  renderListHeader();
});

function visibleLists() {
  return state.lists.filter(l => state.showArchived ? true : !l.archived);
}

function renderListPicker() {
  listPicker.innerHTML = "";
  const active = state.lists.filter(l => !l.archived);
  const archived = state.lists.filter(l => l.archived);

  for (const l of active) listPicker.appendChild(makeOpt(l, l.name));
  if (state.showArchived && archived.length) {
    const grp = document.createElement("optgroup");
    grp.label = "Archived";
    for (const l of archived) grp.appendChild(makeOpt(l, l.name));
    listPicker.appendChild(grp);
  }
  function makeOpt(l, label) {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = label;
    if (l.id === state.activeListId) opt.selected = true;
    return opt;
  }
  // Reflect "Show archived" toggle button label.
  const btn = document.getElementById("show-archived");
  if (btn) {
    const n = archived.length;
    btn.textContent = state.showArchived
      ? `Hide archived (${n})`
      : `Show archived${n ? ` (${n})` : ""}`;
    btn.hidden = !state.showArchived && n === 0;
  }
}

function renderListHeader() {
  const list = state.lists.find(l => l.id === state.activeListId);
  const titleEl = document.getElementById("list-title");
  const metaEl = document.getElementById("list-meta");
  const archivedBadge = document.getElementById("archived-badge");
  if (!list) {
    titleEl.textContent = "Shopping list";
    metaEl.innerHTML = "";
    if (archivedBadge) archivedBadge.hidden = true;
    return;
  }
  titleEl.textContent = list.name;
  if (archivedBadge) archivedBadge.hidden = !list.archived;

  const store = state.stores.find(s => s.id === list.storeId);
  const left = state.items.filter(i => !i.done).length;
  const total = state.items.length;
  const top = [];
  if (store) top.push(`📍 ${store.name}`);
  top.push(total ? `${left} of ${total} left` : "empty");

  const created = formatRelative(list.createdAt);
  const updated = formatRelative(list.updatedAt);
  const createdBy = displayName(list.createdBy);
  const updatedBy = displayName(list.updatedBy);

  const bottom = [];
  if (created) bottom.push(`Created ${created}${createdBy ? ` by ${createdBy}` : ""}`);
  if (updated && (updated !== created || updatedBy !== createdBy)) {
    bottom.push(`Updated ${updated}${updatedBy ? ` by ${updatedBy}` : ""}`);
  }

  metaEl.innerHTML = "";
  const top1 = document.createElement("span");
  top1.textContent = top.join(" · ");
  metaEl.appendChild(top1);
  if (bottom.length) {
    const br = document.createElement("br");
    metaEl.appendChild(br);
    const bot = document.createElement("span");
    bot.className = "muted small";
    bot.textContent = bottom.join(" · ");
    bot.title = absoluteTimes(list);
    metaEl.appendChild(bot);
  }
}

function tsToMillis(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (ts.toDate) return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

function displayName(email) {
  if (!email) return "";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

// Firestore Timestamp → "5 min ago", "yesterday", "Jun 5", or "" if missing.
function formatRelative(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d) return "";
  const now = new Date();
  const diffMs = now - d;
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "yesterday";
  return d.toLocaleDateString(undefined,
    sameYear ? { month: "short", day: "numeric" }
             : { year: "numeric", month: "short", day: "numeric" });
}

function formatAbsolute(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d) return "";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function absoluteTimes(list) {
  const c = formatAbsolute(list.createdAt);
  const u = formatAbsolute(list.updatedAt);
  const parts = [];
  if (c) parts.push(`Created: ${c}${list.createdBy ? ` by ${list.createdBy}` : ""}`);
  if (u) parts.push(`Updated: ${u}${list.updatedBy ? ` by ${list.updatedBy}` : ""}`);
  return parts.join("\n");
}

// ── New list dialog ────────────────────────────────────────────────────────

const newListDialog = document.getElementById("new-list-dialog");
const newListForm = document.getElementById("new-list-form");
const newListName = document.getElementById("new-list-name");
const newListStore = document.getElementById("new-list-store");

document.getElementById("new-list").addEventListener("click", () => {
  newListName.value = defaultListName();
  renderStoreOptions();
  newListStore.value = "";
  newListDialog.showModal();
  setTimeout(() => newListName.select(), 0);
});

newListForm.addEventListener("submit", async (e) => {
  // The dialog returns either "create" or "cancel" via the submitter button.
  const submitter = e.submitter;
  if (!submitter || submitter.value !== "create") return;
  e.preventDefault();
  const name = newListName.value.trim();
  if (!name) return;
  const id = await createList(
    { name, storeId: newListStore.value || null },
    state.user
  );
  state.activeListId = id;
  resubscribeItems();
  newListDialog.close();
  toast(`Created "${name}"`);
});

function defaultListName() {
  const d = new Date();
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} list`;
}

function renderStoreOptions() {
  newListStore.innerHTML = '<option value="">— None —</option>';
  for (const s of state.stores) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    newListStore.appendChild(opt);
  }
}

// ── Add item form ──────────────────────────────────────────────────────────

const addForm = document.getElementById("add-form");
const addInput = document.getElementById("add-input");
const addHint = document.getElementById("add-hint");

addInput.addEventListener("input", () => {
  const raw = addInput.value.trim();
  if (!raw) { addHint.textContent = ""; return; }
  const normalized = normalizeName(raw);
  const existing = state.catalogueIndex.get(normalized);
  const sectionId = existing?.section || suggestSection(normalized);
  const section = getSection(sectionId);
  addHint.innerHTML = "";
  const label = document.createElement("span");
  label.className = "muted";
  label.textContent = existing ? "From catalogue:" : "Will be added to:";
  addHint.appendChild(label);
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = `${section.icon} ${section.name}`;
  addHint.appendChild(pill);
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = addInput.value.trim();
  if (!raw || !state.activeListId) return;
  addInput.value = "";
  addHint.textContent = "";
  const { name: parsedName, quantity } = parseQuantityInput(raw);
  try {
    const { name, section } = await addItem(
      state.activeListId, parsedName, state.user, { quantity }
    );
    const qSuffix = quantity ? ` (${formatQuantity(quantity)})` : "";
    toast(`Added ${name}${qSuffix} → ${getSection(section).name}`);
  } catch (err) {
    console.error(err);
    toast(err.message || "Could not add item");
  }
});

// Pull a leading or trailing quantity out of free-form input.
//   "2 milk"        → { name: "milk",    quantity: "2" }
//   "2 lb chicken"  → { name: "chicken", quantity: "2 lb" }
//   "milk x 2"      → { name: "milk",    quantity: "2" }
//   "milk × 3"      → { name: "milk",    quantity: "3" }
//   "milk"          → { name: "milk",    quantity: ""  }
const UNIT_RE = "(?:lb|lbs|oz|g|kg|ml|l|qt|pt|gal|pkg|pack|dozen|count|ct|bag|bags|box|boxes|can|cans|bottle|bottles)";
export function parseQuantityInput(raw) {
  let s = (raw || "").trim();
  if (!s) return { name: "", quantity: "" };
  let m = s.match(/^(.*?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (m && m[1].trim()) return { name: m[1].trim(), quantity: m[2] };
  m = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?\\s*${UNIT_RE})\\s+(.+)$`, "i"));
  if (m) return { name: m[2].trim(), quantity: m[1].replace(/\s+/g, " ").trim() };
  m = s.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s+(.+)$/);
  if (m) return { name: m[2].trim(), quantity: m[1] };
  m = s.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m) return { name: m[2].trim(), quantity: m[1] };
  return { name: s, quantity: "" };
}

// "× 2" for bare numbers, the raw value otherwise.
function formatQuantity(q) {
  if (!q) return "";
  return /^\d+(?:\.\d+)?$/.test(q) ? `× ${q}` : q;
}

// Numeric quantity if the value is just a number; null otherwise.
function numericQuantity(q) {
  if (!q) return 0;
  return /^\d+(?:\.\d+)?$/.test(q) ? Number(q) : null;
}

// ── Catalogue suggestions (datalist) ───────────────────────────────────────

function renderSuggestions() {
  const dl = document.getElementById("catalogue-suggestions");
  dl.innerHTML = "";
  // Sort by useCount desc then name.
  const sorted = [...state.catalogue].sort((a, b) =>
    (b.useCount || 0) - (a.useCount || 0) || a.name.localeCompare(b.name)
  );
  for (const c of sorted.slice(0, 200)) {
    const opt = document.createElement("option");
    opt.value = c.name;
    dl.appendChild(opt);
  }
}

// ── Items / sections ───────────────────────────────────────────────────────

function renderItems() {
  const root = document.getElementById("sections");
  const empty = document.getElementById("empty-list");
  root.innerHTML = "";
  if (state.items.length === 0) {
    empty.hidden = false;
    renderListHeader();
    return;
  }
  empty.hidden = true;

  // Group by section id.
  const groups = new Map();
  for (const item of state.items) {
    const sid = item.section || "other";
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(item);
  }

  // Sort sections by their canonical order.
  const ordered = [...groups.entries()].sort((a, b) => {
    const oa = state.sectionsById.get(a[0])?.order ?? 999;
    const ob = state.sectionsById.get(b[0])?.order ?? 999;
    return oa - ob;
  });

  for (const [sid, items] of ordered) {
    const sec = getSection(sid);
    const allDone = items.every(i => i.done);
    const key = `${state.activeListId}:${sid}`;
    const override = state.sectionOpen.get(key);
    const open = override !== undefined ? override : !allDone;

    const card = document.createElement("details");
    card.className = "section" + (allDone ? " all-done" : "");
    if (open) card.setAttribute("open", "");

    const head = document.createElement("summary");
    head.className = "section-head";
    head.innerHTML = `
      <span class="chev">▶</span>
      <span class="icon">${sec.icon}</span>
      <span>${sec.name}</span>
      <span class="count">${items.filter(i => !i.done).length}/${items.length}</span>
    `;
    card.appendChild(head);

    card.addEventListener("toggle", () => {
      // The toggle event also fires on initial DOM insertion when we set the
      // `open` attribute, which would otherwise capture the auto-default as a
      // permanent user override. Only persist when the new state differs from
      // what the auto-default would render this section.
      const autoDefault = !allDone;
      if (card.open === autoDefault) {
        state.sectionOpen.delete(key);
      } else {
        state.sectionOpen.set(key, card.open);
      }
    });

    const ul = document.createElement("ul");
    ul.className = "items";
    // Unchecked first, then checked.
    items.sort((a, b) => Number(a.done) - Number(b.done));
    for (const it of items) ul.appendChild(itemRow(it));
    card.appendChild(ul);
    root.appendChild(card);
  }

  renderListHeader();
}

function itemRow(item) {
  const li = document.createElement("li");
  li.className = "item";

  const id = `chk-${item.id}`;
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = id;
  cb.checked = !!item.done;
  cb.addEventListener("change", () => {
    setItemDone(state.activeListId, item.id, cb.checked, state.user).catch(console.error);
  });
  const lbl = document.createElement("label");
  lbl.htmlFor = id;
  lbl.className = "check";

  const txt = document.createElement("div");
  txt.className = "item-text";
  const name = document.createElement("div");
  name.className = "item-name" + (item.done ? " done" : "");
  name.textContent = item.name;
  if (item.quantity) {
    const qty = document.createElement("span");
    qty.className = "item-qty";
    qty.textContent = formatQuantity(item.quantity);
    name.appendChild(qty);
  }
  txt.appendChild(name);
  if (item.note) {
    const note = document.createElement("div");
    note.className = "item-note";
    note.textContent = item.note;
    txt.appendChild(note);
  }

  // Bumpers: only meaningful when quantity is empty or numeric.
  const numeric = numericQuantity(item.quantity);
  const bumpers = document.createElement("div");
  bumpers.className = "item-bumpers";
  if (numeric !== null && !item.done) {
    const minus = document.createElement("button");
    minus.className = "bump"; minus.type = "button"; minus.textContent = "−";
    minus.title = "Decrease quantity";
    minus.addEventListener("click", () => bumpQuantity(item, -1));
    const plus = document.createElement("button");
    plus.className = "bump"; plus.type = "button"; plus.textContent = "+";
    plus.title = "Increase quantity";
    plus.addEventListener("click", () => bumpQuantity(item, +1));
    bumpers.append(minus, plus);
  }

  const edit = document.createElement("button");
  edit.className = "item-edit";
  edit.title = "Edit";
  edit.textContent = "✎";
  edit.addEventListener("click", () => openItemDialog(item));

  const del = document.createElement("button");
  del.className = "item-delete";
  del.title = "Remove item";
  del.textContent = "✕";
  del.addEventListener("click", () =>
    deleteItem(state.activeListId, item.id, state.user).catch(console.error)
  );

  li.append(cb, lbl, txt, bumpers, edit, del);
  return li;
}

async function bumpQuantity(item, delta) {
  const current = numericQuantity(item.quantity);
  if (current === null) return; // free-text quantity; user must edit dialog
  let next = (current || 1) + delta;
  if (next < 1) {
    await deleteItem(state.activeListId, item.id, state.user);
    return;
  }
  // Treat 1 as "no quantity" so the row reads as a single thing.
  const newQty = next === 1 ? "" : String(next);
  await updateItem(state.activeListId, item.id,
    { quantity: newQty }, state.user);
}

// ── Item edit dialog ───────────────────────────────────────────────────────

const itemDialog = document.getElementById("item-dialog");
const itemForm = document.getElementById("item-form");
const itemName = document.getElementById("item-name");
const itemSection = document.getElementById("item-section");
const itemQuantity = document.getElementById("item-quantity");
const itemNote = document.getElementById("item-note");
const itemDelete = document.getElementById("item-delete");

function renderItemSectionOptions() {
  const previous = itemSection.value;
  itemSection.innerHTML = "";
  for (const s of state.sections) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.icon} ${s.name}`;
    itemSection.appendChild(opt);
  }
  if (previous) itemSection.value = previous;
}
renderItemSectionOptions();

let editingItem = null;
function openItemDialog(item) {
  editingItem = item;
  itemName.value = item.name;
  itemQuantity.value = item.quantity || "";
  itemSection.value = item.section || "other";
  itemNote.value = item.note || "";
  itemDialog.showModal();
}

itemDelete.addEventListener("click", async () => {
  if (!editingItem) return;
  await deleteItem(state.activeListId, editingItem.id, state.user);
  itemDialog.close();
});

itemForm.addEventListener("submit", async (e) => {
  const submitter = e.submitter;
  if (!submitter || submitter.value !== "save") return;
  e.preventDefault();
  if (!editingItem) return;
  const patch = {
    name: itemName.value.trim() || editingItem.name,
    note: itemNote.value.trim(),
    quantity: itemQuantity.value.trim(),
  };
  const newSection = itemSection.value;
  if (newSection !== editingItem.section) {
    await setItemSection(
      state.activeListId, editingItem.id, editingItem.normalized, newSection,
      state.user,
    );
  }
  await updateItem(state.activeListId, editingItem.id, patch, state.user);
  itemDialog.close();
});

// ── Catalogue view ─────────────────────────────────────────────────────────

const catalogueSearch = document.getElementById("catalogue-search");
const catalogueSort = document.getElementById("catalogue-sort");
catalogueSearch.addEventListener("input", renderCatalogue);
catalogueSort.addEventListener("change", () => {
  try { localStorage.setItem("catSort", catalogueSort.value); } catch {}
  renderCatalogue();
});
try {
  const saved = localStorage.getItem("catSort");
  if (saved) catalogueSort.value = saved;
} catch {}

function renderCatalogue() {
  const root = document.getElementById("catalogue-list");
  const empty = document.getElementById("empty-catalogue");
  const q = catalogueSearch.value.trim().toLowerCase();
  root.innerHTML = "";

  const sortFn = ({
    frequency: (a, b) =>
      (b.useCount || 0) - (a.useCount || 0) || a.name.localeCompare(b.name),
    recent: (a, b) =>
      tsToMillis(b.lastUsedAt) - tsToMillis(a.lastUsedAt) || a.name.localeCompare(b.name),
    alpha: (a, b) => a.name.localeCompare(b.name),
  })[catalogueSort.value] || ((a, b) => a.name.localeCompare(b.name));

  const items = state.catalogue
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .sort(sortFn);

  if (items.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const c of items) {
    const sec = getSection(c.section);
    const row = document.createElement("div");
    row.className = "cat-row";
    const nameEl = document.createElement("span");
    nameEl.className = "cat-name";
    nameEl.textContent = c.name;
    const sectionEl = document.createElement("span");
    sectionEl.className = "cat-section";
    sectionEl.textContent = `${sec.icon} ${sec.name}`;
    const useEl = document.createElement("span");
    useEl.className = "cat-use";
    if (c.useCount) {
      useEl.textContent = `× ${c.useCount}`;
      const last = formatRelative(c.lastUsedAt);
      if (last) useEl.title = `Last added ${last}`;
    }
    row.append(nameEl, sectionEl, useEl);

    const listItem = state.items.find(i => i.normalized === c.normalized && !i.done);
    const numeric = listItem ? numericQuantity(listItem.quantity) : null;

    if (listItem && numeric !== null) {
      const bumpers = document.createElement("div");
      bumpers.className = "item-bumpers";
      const minus = document.createElement("button");
      minus.className = "bump"; minus.type = "button"; minus.textContent = "−";
      minus.title = "Decrease quantity";
      minus.addEventListener("click", () => bumpQuantity(listItem, -1));
      const plus = document.createElement("button");
      plus.className = "bump"; plus.type = "button"; plus.textContent = "+";
      plus.title = "Increase quantity";
      plus.addEventListener("click", () => bumpQuantity(listItem, +1));
      bumpers.append(minus, plus);
      row.append(bumpers);
    }

    const add = document.createElement("button");
    add.className = "cat-add";
    add.textContent = listItem ? "＋ Add again" : "＋ Add";
    add.title = "Add to current list";
    add.addEventListener("click", async () => {
      if (!state.activeListId) return;
      await addItem(state.activeListId, c.name, state.user);
      toast(`Added ${c.name}`);
    });

    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "✕";
    del.title = "Remove from catalogue";
    del.addEventListener("click", async () => {
      if (!confirm(`Remove "${c.name}" from the catalogue?`)) return;
      await deleteCatalogueEntry(c.normalized);
    });

    row.append(add, del);
    root.appendChild(row);
  }
}

// ── Stores view ────────────────────────────────────────────────────────────

const storeForm = document.getElementById("store-form");
const storeInput = document.getElementById("store-input");
storeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = storeInput.value.trim();
  if (!v) return;
  storeInput.value = "";
  await addStore(v, state.user);
  toast(`Added ${v}`);
});

function renderStores() {
  const root = document.getElementById("stores-list");
  root.innerHTML = "";
  if (state.stores.length === 0) {
    const li = document.createElement("li");
    li.className = "store-row muted";
    li.textContent = "No stores yet. Add one above.";
    root.appendChild(li);
    return;
  }
  for (const s of state.stores) {
    const li = document.createElement("li");
    li.className = "store-row";

    const name = document.createElement("span");
    name.className = "store-name";
    name.textContent = s.name;

    const usedBy = state.lists.filter(l => l.storeId === s.id).length;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = usedBy ? `${usedBy} list${usedBy === 1 ? "" : "s"}` : "unused";

    const tag = document.createElement("button");
    tag.className = "ghost";
    tag.textContent = "Tag current list";
    tag.title = "Tag the active shopping list with this store";
    tag.addEventListener("click", async () => {
      if (!state.activeListId) return;
      await setListStore(state.activeListId, s.id, state.user);
      toast(`Tagged list with ${s.name}`);
    });

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (!confirm(`Delete store "${s.name}"?`)) return;
      await deleteStore(s.id);
    });

    li.append(name, count, tag, del);
    root.appendChild(li);
  }
}

// ── Rename / delete current list ───────────────────────────────────────────

const renameDialog = document.getElementById("rename-list-dialog");
const renameForm = document.getElementById("rename-list-form");
const renameInput = document.getElementById("rename-list-name");
const renameStore = document.getElementById("rename-list-store");
const renameMeta = document.getElementById("rename-list-meta");
const deleteListBtn = document.getElementById("delete-list");
const archiveBtn = document.getElementById("archive-list");

document.getElementById("rename-list").addEventListener("click", () => {
  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;
  renameInput.value = list.name;
  populateStoreSelect(renameStore, list.storeId || "");
  archiveBtn.textContent = list.archived ? "Unarchive" : "Archive";
  renameMeta.textContent = listMetaSummary(list);
  renameDialog.showModal();
  setTimeout(() => renameInput.select(), 0);
});

archiveBtn.addEventListener("click", async () => {
  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;
  const next = !list.archived;
  await setListArchived(list.id, next, state.user);
  renameDialog.close();
  toast(next ? "List archived" : "List unarchived");
  if (next && !state.showArchived) {
    // active list just disappeared from the picker; subscribeLists will jump
    // us to the next visible one.
  }
});

document.getElementById("show-archived").addEventListener("click", () => {
  state.showArchived = !state.showArchived;
  renderListPicker();
});

function listMetaSummary(list) {
  const parts = [];
  if (list.createdAt) {
    const c = formatAbsolute(list.createdAt);
    parts.push(`Created ${c}${list.createdBy ? ` by ${list.createdBy}` : ""}`);
  }
  if (list.updatedAt) {
    const u = formatAbsolute(list.updatedAt);
    parts.push(`Updated ${u}${list.updatedBy ? ` by ${list.updatedBy}` : ""}`);
  }
  return parts.join("\n");
}

renameForm.addEventListener("submit", async (e) => {
  const submitter = e.submitter;
  if (!submitter || submitter.value !== "save") return;
  e.preventDefault();
  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;
  const name = renameInput.value.trim();
  if (!name) return;
  await renameList(list.id, name, state.user);
  if ((renameStore.value || null) !== (list.storeId || null)) {
    await setListStore(list.id, renameStore.value || null, state.user);
  }
  renameDialog.close();
  toast("List updated");
});

deleteListBtn.addEventListener("click", async () => {
  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;
  if (!confirm(`Delete "${list.name}"? Items in this list will also be removed.`)) return;
  await deleteList(list.id);
  state.activeListId = null;
  renameDialog.close();
  toast("List deleted");
});

function populateStoreSelect(sel, selectedId) {
  sel.innerHTML = '<option value="">— None —</option>';
  for (const s of state.stores) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ── Clone items from another list ──────────────────────────────────────────

const cloneDialog = document.getElementById("clone-dialog");
const cloneForm = document.getElementById("clone-form");
const cloneSource = document.getElementById("clone-source");
const cloneIncludeDone = document.getElementById("clone-include-done");
const cloneItemsEl = document.getElementById("clone-items");
const cloneStatus = document.getElementById("clone-status");
const cloneConfirm = document.getElementById("clone-confirm");

let cloneSourceItems = []; // items currently rendered in the dialog

document.getElementById("clone-from").addEventListener("click", async () => {
  if (!state.activeListId) return;
  const others = state.lists.filter(l => l.id !== state.activeListId);
  if (others.length === 0) {
    toast("No other lists to clone from");
    return;
  }
  cloneSource.innerHTML = "";
  for (const l of others) {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    cloneSource.appendChild(opt);
  }
  cloneIncludeDone.checked = false;
  cloneStatus.textContent = "";
  await loadCloneSource();
  cloneDialog.showModal();
});

cloneSource.addEventListener("change", loadCloneSource);
cloneIncludeDone.addEventListener("change", loadCloneSource);

async function loadCloneSource() {
  cloneItemsEl.innerHTML = "";
  cloneStatus.textContent = "Loading…";
  cloneSourceItems = [];
  try {
    const list = state.lists.find(l => l.id === cloneSource.value);
    if (!list) { cloneStatus.textContent = ""; return; }
    const all = await fetchAllItems([list]);
    cloneSourceItems = cloneIncludeDone.checked ? all : all.filter(i => !i.done);
    if (cloneSourceItems.length === 0) {
      cloneStatus.textContent = cloneIncludeDone.checked
        ? "That list has no items."
        : "That list has no unchecked items.";
      return;
    }
    cloneStatus.textContent = "";
    renderCloneItems();
  } catch (e) {
    console.error(e);
    cloneStatus.textContent = "Could not load items.";
  }
}

function renderCloneItems() {
  cloneItemsEl.innerHTML = "";

  const tools = document.createElement("div");
  tools.className = "clone-toolbar";
  const allBtn = document.createElement("button");
  allBtn.type = "button"; allBtn.textContent = "Select all";
  const noneBtn = document.createElement("button");
  noneBtn.type = "button"; noneBtn.textContent = "Select none";
  tools.append(allBtn, noneBtn);
  cloneItemsEl.appendChild(tools);

  for (const it of cloneSourceItems) {
    const row = document.createElement("label");
    row.className = "clone-row" + (it.done ? " done" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !it.done; // default: select unchecked items
    cb.dataset.itemId = it.id;
    const name = document.createElement("span");
    name.className = "clone-name";
    name.textContent = it.name
      + (it.quantity ? ` ${formatQuantity(it.quantity)}` : "")
      + (it.note ? ` — ${it.note}` : "");
    const sec = getSection(it.section);
    const sectionTag = document.createElement("span");
    sectionTag.className = "clone-section";
    sectionTag.textContent = `${sec.icon} ${sec.name}`;
    row.append(cb, name, sectionTag);
    cloneItemsEl.appendChild(row);
  }

  allBtn.addEventListener("click", () => {
    cloneItemsEl.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = true);
  });
  noneBtn.addEventListener("click", () => {
    cloneItemsEl.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false);
  });
}

cloneForm.addEventListener("submit", async (e) => {
  const submitter = e.submitter;
  if (!submitter || submitter.value !== "clone") return;
  e.preventDefault();
  const checked = new Set(
    [...cloneItemsEl.querySelectorAll("input[type=checkbox]:checked")]
      .map(c => c.dataset.itemId)
  );
  const picked = cloneSourceItems.filter(i => checked.has(i.id));
  if (picked.length === 0) {
    cloneStatus.textContent = "Pick at least one item.";
    return;
  }
  cloneConfirm.disabled = true;
  try {
    const n = await cloneItems(state.activeListId, picked, state.user);
    cloneDialog.close();
    toast(`Cloned ${n} item${n === 1 ? "" : "s"}`);
  } catch (err) {
    console.error(err);
    cloneStatus.textContent = "Could not clone items.";
  } finally {
    cloneConfirm.disabled = false;
  }
});

// ── Cross-list search ──────────────────────────────────────────────────────

const searchInput = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");
const searchResults = document.getElementById("search-results");
const searchRefresh = document.getElementById("search-refresh");

searchInput.addEventListener("input", () => {
  state.searchQuery = searchInput.value;
  renderSearchResults();
});

searchRefresh.addEventListener("click", () => refreshSearchData(true));

async function refreshSearchData(force = false) {
  if (state.searchLoading) return;
  if (!force && state.allItems.length > 0) {
    renderSearchResults();
    return;
  }
  state.searchLoading = true;
  searchStatus.textContent = "Loading items from all lists…";
  try {
    state.allItems = await fetchAllItems(state.lists);
    searchStatus.textContent = "";
    renderSearchResults();
  } catch (e) {
    console.error(e);
    searchStatus.textContent = "Could not load items.";
  } finally {
    state.searchLoading = false;
  }
}

function renderSearchResults() {
  searchResults.innerHTML = "";
  const q = state.searchQuery.trim().toLowerCase();
  if (!q) {
    searchStatus.textContent = state.allItems.length
      ? `Type to search across ${state.allItems.length} item${state.allItems.length === 1 ? "" : "s"} in ${state.lists.length} list${state.lists.length === 1 ? "" : "s"}.`
      : "No items in any list yet.";
    return;
  }
  const matches = state.allItems.filter(i =>
    (i.name && i.name.toLowerCase().includes(q)) ||
    (i.note && i.note.toLowerCase().includes(q)) ||
    (i.normalized && i.normalized.includes(q))
  );
  if (matches.length === 0) {
    searchStatus.textContent = `No matches for "${state.searchQuery}".`;
    return;
  }
  searchStatus.textContent = `${matches.length} match${matches.length === 1 ? "" : "es"}.`;

  // Group by list, ordered by list order in state.lists.
  const byList = new Map();
  for (const m of matches) {
    if (!byList.has(m.listId)) byList.set(m.listId, []);
    byList.get(m.listId).push(m);
  }
  const orderedListIds = state.lists
    .map(l => l.id)
    .filter(id => byList.has(id));

  for (const lid of orderedListIds) {
    const list = state.lists.find(l => l.id === lid);
    const items = byList.get(lid);
    const group = document.createElement("section");
    group.className = "search-group";

    const head = document.createElement("div");
    head.className = "search-group-head";
    const title = document.createElement("span");
    title.textContent = list.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${items.length} match${items.length === 1 ? "" : "es"}`;
    const open = document.createElement("button");
    open.className = "open-list";
    open.type = "button";
    open.textContent = "Open list →";
    open.addEventListener("click", () => {
      state.activeListId = lid;
      state.sectionOpen.clear();
      listPicker.value = lid;
      resubscribeItems();
      switchTab("list");
    });
    head.append(title, count, open);
    group.appendChild(head);

    for (const it of items) {
      const sec = getSection(it.section);
      const row = document.createElement("div");
      row.className = "search-row" + (it.done ? " done" : "");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = it.name
      + (it.quantity ? ` ${formatQuantity(it.quantity)}` : "")
      + (it.note ? ` — ${it.note}` : "");
      const tag = document.createElement("span");
      tag.className = "section-tag";
      tag.textContent = `${sec.icon} ${sec.name}`;
      row.append(name, tag);
      group.appendChild(row);
    }
    searchResults.appendChild(group);
  }
}

// ── Categories tab ─────────────────────────────────────────────────────────

const categoriesList = document.getElementById("categories-list");
const categoryDialog = document.getElementById("category-dialog");
const categoryForm = document.getElementById("category-form");
const categoryName = document.getElementById("category-name");
const categoryIcon = document.getElementById("category-icon");
const categoryStatus = document.getElementById("category-status");
const categoryDeleteBtn = document.getElementById("category-delete");
const categoryDialogTitle = document.getElementById("category-dialog-title");

let editingCategoryId = null; // null = creating new

document.getElementById("add-category").addEventListener("click", () => {
  editingCategoryId = null;
  categoryDialogTitle.textContent = "Add category";
  categoryName.value = "";
  categoryIcon.value = "🛍️";
  categoryDeleteBtn.hidden = true;
  categoryStatus.textContent = "";
  categoryDialog.showModal();
  setTimeout(() => categoryName.focus(), 0);
});

function openEditCategory(section) {
  editingCategoryId = section.id;
  categoryDialogTitle.textContent = section.custom ? "Edit category" : "Edit category (built-in)";
  categoryName.value = section.name;
  categoryIcon.value = section.icon;
  categoryDeleteBtn.hidden = !section.custom;
  categoryStatus.textContent = section.custom
    ? ""
    : "Built-in category. Renaming or changing the icon saves a household override.";
  categoryDialog.showModal();
  setTimeout(() => categoryName.select(), 0);
}

categoryForm.addEventListener("submit", async (e) => {
  const submitter = e.submitter;
  if (!submitter || submitter.value !== "save") return;
  e.preventDefault();
  const name = categoryName.value.trim();
  const icon = categoryIcon.value.trim() || "🛍️";
  if (!name) {
    categoryStatus.textContent = "Name is required.";
    return;
  }
  try {
    if (editingCategoryId) {
      await upsertSection(editingCategoryId, { name, icon });
    } else {
      const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const maxOrder = state.sections.reduce((m, s) => Math.max(m, s.order || 0), 0);
      await upsertSection(id, {
        name, icon, order: maxOrder + 1, custom: true,
      });
    }
    categoryDialog.close();
    toast("Category saved");
  } catch (err) {
    console.error(err);
    categoryStatus.textContent = "Could not save.";
  }
});

categoryDeleteBtn.addEventListener("click", async () => {
  if (!editingCategoryId) return;
  const section = state.sectionsById.get(editingCategoryId);
  if (!section?.custom) return;
  const usedCount = countItemsInSection(editingCategoryId);
  const msg = usedCount > 0
    ? `Delete "${section.name}"? ${usedCount} item${usedCount === 1 ? "" : "s"} in the current list use it and will move to Other.`
    : `Delete "${section.name}"?`;
  if (!confirm(msg)) return;
  await deleteSectionDoc(editingCategoryId);
  categoryDialog.close();
  toast("Category deleted");
});

function countItemsInSection(sectionId) {
  return state.items.filter(i => i.section === sectionId).length;
}

function renderCategories() {
  if (!categoriesList) return;
  categoriesList.innerHTML = "";
  state.sections.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "cat-item";

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = s.icon;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = s.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = s.custom ? "custom" : "built-in";

    const up = document.createElement("button");
    up.className = "move"; up.type = "button"; up.textContent = "▲"; up.title = "Move up";
    up.disabled = i === 0;
    up.addEventListener("click", () => moveCategory(i, -1));

    const down = document.createElement("button");
    down.className = "move"; down.type = "button"; down.textContent = "▼"; down.title = "Move down";
    down.disabled = i === state.sections.length - 1;
    down.addEventListener("click", () => moveCategory(i, +1));

    const edit = document.createElement("button");
    edit.className = "edit"; edit.type = "button"; edit.textContent = "✎";
    edit.title = "Edit";
    edit.addEventListener("click", () => openEditCategory(s));

    li.append(icon, name, meta, up, down, edit);
    categoriesList.appendChild(li);
  });
}

async function moveCategory(index, direction) {
  const next = index + direction;
  if (next < 0 || next >= state.sections.length) return;
  const reordered = [...state.sections];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(next, 0, moved);
  // Persist by writing the new order index for every section. This converts
  // built-ins into override docs (with name/icon copied) so their order
  // sticks across reloads.
  const ops = reordered.map((s, i) => ({
    id: s.id,
    data: { name: s.name, icon: s.icon, order: i + 1, custom: !!s.custom },
  }));
  // Optimistic local update so the move feels instant.
  state.sections = reordered.map((s, i) => ({ ...s, order: i + 1 }));
  state.sectionsById = new Map(state.sections.map(s => [s.id, s]));
  renderCategories();
  renderItems();
  try {
    await Promise.all(ops.map(o => upsertSection(o.id, o.data)));
  } catch (err) {
    console.error(err);
    toast("Could not save order");
  }
}

// Honor ?tab=… from manifest shortcuts and ?list=… deep links.
{
  const params = new URLSearchParams(location.search);
  const t = params.get("tab");
  if (t && ["list", "search", "catalogue", "categories", "stores"].includes(t)) {
    state.currentTab = t;
  }
  const linkedListId = params.get("list");
  if (linkedListId) state.activeListId = linkedListId;
}

// ── Share list ─────────────────────────────────────────────────────────────

document.getElementById("share-list").addEventListener("click", async () => {
  if (!state.activeListId) return;
  const url = `${location.origin}${location.pathname}?list=${state.activeListId}`;
  const list = state.lists.find(l => l.id === state.activeListId);
  const title = list?.name || "Shopping list";
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied!");
  } catch {
    toast(url);
  }
});

// ── Toast ──────────────────────────────────────────────────────────────────

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
