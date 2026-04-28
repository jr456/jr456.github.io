// Top-level UI controller. Subscribes to Firestore, renders into the DOM,
// wires events.

import { signIn, signOutCurrent, watchAuth } from "./auth.js";
import {
  ensureHousehold,
  subscribeLists, subscribeItems, subscribeCatalogue, subscribeStores,
  createList, deleteList, renameList, setListStore, clearCheckedItems,
  addItem, updateItem, setItemDone, deleteItem, setItemSection,
  deleteCatalogueEntry,
  addStore, deleteStore,
} from "./db.js";
import { SECTIONS, SECTIONS_BY_ID, suggestSection, normalizeName } from "./sections.js";

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  user: null,
  lists: [],
  activeListId: null,
  items: [],
  catalogue: [],
  stores: [],
  catalogueIndex: new Map(), // normalized → catalogue entry
  unsubs: [],
  currentTab: "list",
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
    catalogue: "catalogue-view",
    stores: "stores-view",
  })[name]);
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
    if (!state.activeListId || !lists.find(l => l.id === state.activeListId)) {
      state.activeListId = lists[0].id;
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
}

let unsubItems = null;
function resubscribeItems() {
  if (unsubItems) { unsubItems(); unsubItems = null; }
  if (!state.activeListId) return;
  unsubItems = subscribeItems(state.activeListId, (items) => {
    state.items = items;
    renderItems();
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
  resubscribeItems();
  renderListHeader();
});

function renderListPicker() {
  listPicker.innerHTML = "";
  for (const l of state.lists) {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === state.activeListId) opt.selected = true;
    listPicker.appendChild(opt);
  }
}

function renderListHeader() {
  const list = state.lists.find(l => l.id === state.activeListId);
  const titleEl = document.getElementById("list-title");
  const metaEl = document.getElementById("list-meta");
  if (!list) {
    titleEl.textContent = "Shopping list";
    metaEl.textContent = "";
    return;
  }
  titleEl.textContent = list.name;
  const store = state.stores.find(s => s.id === list.storeId);
  const left = state.items.filter(i => !i.done).length;
  const total = state.items.length;
  const parts = [];
  if (store) parts.push(`📍 ${store.name}`);
  parts.push(total ? `${left} of ${total} left` : "empty");
  metaEl.textContent = parts.join(" · ");
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
  toast(`Created “${name}”`);
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
  const section = SECTIONS_BY_ID[sectionId];
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
  try {
    const { name, section } = await addItem(state.activeListId, raw, state.user);
    toast(`Added ${name} → ${SECTIONS_BY_ID[section].name}`);
  } catch (err) {
    console.error(err);
    toast(err.message || "Could not add item");
  }
});

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
    const oa = SECTIONS_BY_ID[a[0]]?.order ?? 999;
    const ob = SECTIONS_BY_ID[b[0]]?.order ?? 999;
    return oa - ob;
  });

  for (const [sid, items] of ordered) {
    const sec = SECTIONS_BY_ID[sid] || SECTIONS_BY_ID.other;
    const card = document.createElement("section");
    card.className = "section";

    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = `
      <span class="icon">${sec.icon}</span>
      <span>${sec.name}</span>
      <span class="count">${items.filter(i => !i.done).length}/${items.length}</span>
    `;
    card.appendChild(head);

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
    setItemDone(state.activeListId, item.id, cb.checked).catch(console.error);
  });
  const lbl = document.createElement("label");
  lbl.htmlFor = id;
  lbl.className = "check";

  const txt = document.createElement("div");
  txt.className = "item-text";
  const name = document.createElement("div");
  name.className = "item-name" + (item.done ? " done" : "");
  name.textContent = item.name;
  txt.appendChild(name);
  if (item.note) {
    const note = document.createElement("div");
    note.className = "item-note";
    note.textContent = item.note;
    txt.appendChild(note);
  }

  const edit = document.createElement("button");
  edit.className = "item-edit";
  edit.title = "Edit";
  edit.textContent = "✎";
  edit.addEventListener("click", () => openItemDialog(item));

  li.append(cb, lbl, txt, edit);
  return li;
}

// ── Item edit dialog ───────────────────────────────────────────────────────

const itemDialog = document.getElementById("item-dialog");
const itemForm = document.getElementById("item-form");
const itemName = document.getElementById("item-name");
const itemSection = document.getElementById("item-section");
const itemNote = document.getElementById("item-note");
const itemDelete = document.getElementById("item-delete");

// Populate section options once.
for (const s of SECTIONS) {
  const opt = document.createElement("option");
  opt.value = s.id;
  opt.textContent = `${s.icon} ${s.name}`;
  itemSection.appendChild(opt);
}

let editingItem = null;
function openItemDialog(item) {
  editingItem = item;
  itemName.value = item.name;
  itemSection.value = item.section || "other";
  itemNote.value = item.note || "";
  itemDialog.showModal();
}

itemDelete.addEventListener("click", async () => {
  if (!editingItem) return;
  await deleteItem(state.activeListId, editingItem.id);
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
  };
  const newSection = itemSection.value;
  if (newSection !== editingItem.section) {
    await setItemSection(
      state.activeListId, editingItem.id, editingItem.normalized, newSection
    );
  }
  await updateItem(state.activeListId, editingItem.id, patch);
  itemDialog.close();
});

// ── Catalogue view ─────────────────────────────────────────────────────────

const catalogueSearch = document.getElementById("catalogue-search");
catalogueSearch.addEventListener("input", renderCatalogue);

function renderCatalogue() {
  const root = document.getElementById("catalogue-list");
  const empty = document.getElementById("empty-catalogue");
  const q = catalogueSearch.value.trim().toLowerCase();
  root.innerHTML = "";

  const items = state.catalogue
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (items.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const c of items) {
    const sec = SECTIONS_BY_ID[c.section] || SECTIONS_BY_ID.other;
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <span class="cat-name"></span>
      <span class="cat-section"></span>
    `;
    row.children[0].textContent = c.name;
    row.children[1].textContent = `${sec.icon} ${sec.name}`;

    const add = document.createElement("button");
    add.className = "cat-add";
    add.textContent = "＋ Add";
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
      if (!confirm(`Remove “${c.name}” from the catalogue?`)) return;
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
      await setListStore(state.activeListId, s.id);
      toast(`Tagged list with ${s.name}`);
    });

    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (!confirm(`Delete store “${s.name}”?`)) return;
      await deleteStore(s.id);
    });

    li.append(name, count, tag, del);
    root.appendChild(li);
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
