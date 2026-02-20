import { categorizeItem, SECTION_ORDER, SECTION_ICONS } from './categories.js';

// ============================================================
// Firebase Configuration
// ============================================================
// IMPORTANT: Replace with your own Firebase project config.
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or use existing)
// 3. Enable Authentication > Google sign-in
// 4. Enable Cloud Firestore
// 5. Add a Web app and copy the config here
// 6. In Firestore rules, restrict to your household
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ============================================================
// Initialize Firebase
// ============================================================
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============================================================
// DOM References
// ============================================================
const $ = id => document.getElementById(id);

const authScreen    = $('auth-screen');
const appShell      = $('app');
const signInBtn     = $('google-signin-btn');
const signOutBtn    = $('btn-signout');
const userAvatar    = $('user-avatar');
const tabBar        = document.querySelector('.tab-bar');
const storeBar      = $('store-bar');
const summaryBar    = $('summary-bar');
const summaryText   = $('summary-text');
const clearChecked  = $('btn-clear-checked');
const listContainer = $('list-container');
const listEmpty     = $('list-empty');
const catContainer  = $('catalogue-container');
const catEmpty      = $('catalogue-empty');
const catSearch     = $('catalogue-search');
const storesContainer = $('stores-container');
const storesEmpty   = $('stores-empty');
const itemInput     = $('item-input');
const addBtn        = $('btn-add');
const addBar        = $('add-bar');
const addStoreBtn   = $('btn-add-store');
const autocomplete  = $('autocomplete-list');
const modalOverlay  = $('modal-overlay');
const modal         = $('modal');
const modalTitle    = $('modal-title');
const modalInput    = $('modal-input');
const modalExtra    = $('modal-extra');
const modalCancel   = $('modal-cancel');
const modalConfirm  = $('modal-confirm');
const toast         = $('toast');

// ============================================================
// State
// ============================================================
let currentUser = null;
let currentView = 'list';
let currentStore = 'all';
let items = [];
let catalogue = [];
let stores = [];
let unsubItems = null;
let unsubCatalogue = null;
let unsubStores = null;

// Household ID — shared collection key for your family
// We use a fixed collection so both users share the same list
const HOUSEHOLD_ID = 'family';

// Firestore collection references
function itemsRef() {
  return db.collection('households').doc(HOUSEHOLD_ID).collection('items');
}
function catalogueRef() {
  return db.collection('households').doc(HOUSEHOLD_ID).collection('catalogue');
}
function storesRef() {
  return db.collection('households').doc(HOUSEHOLD_ID).collection('stores');
}

// ============================================================
// Auth
// ============================================================
signInBtn.addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    // Fallback to redirect for mobile
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      auth.signInWithRedirect(provider);
    } else {
      showToast('Sign-in failed: ' + err.message);
    }
  });
});

signOutBtn.addEventListener('click', () => {
  auth.signOut();
});

auth.onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    authScreen.style.display = 'none';
    appShell.classList.add('active');
    userAvatar.src = user.photoURL || '';
    userAvatar.alt = user.displayName || 'User';
    subscribeToData();
  } else {
    authScreen.style.display = '';
    appShell.classList.remove('active');
    unsubscribeAll();
  }
});

// ============================================================
// Real-time Firestore Subscriptions
// ============================================================
function subscribeToData() {
  unsubscribeAll();

  // Items
  unsubItems = itemsRef().orderBy('createdAt', 'desc').onSnapshot(snap => {
    items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderList();
    renderSummary();
  });

  // Catalogue
  unsubCatalogue = catalogueRef().orderBy('name').onSnapshot(snap => {
    catalogue = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCatalogue();
  });

  // Stores
  unsubStores = storesRef().orderBy('name').onSnapshot(snap => {
    stores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderStoreChips();
    renderStores();
  });
}

function unsubscribeAll() {
  if (unsubItems) unsubItems();
  if (unsubCatalogue) unsubCatalogue();
  if (unsubStores) unsubStores();
  unsubItems = unsubCatalogue = unsubStores = null;
}

// ============================================================
// Add Item
// ============================================================
function addItem(name, qty = 1) {
  name = name.trim();
  if (!name) return;

  const category = categorizeItem(name);
  const store = currentStore === 'all' ? null : currentStore;

  // Add to active list
  itemsRef().add({
    name,
    category,
    qty,
    checked: false,
    store,
    addedBy: currentUser.displayName || currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Add to catalogue if not already present
  const nameKey = name.toLowerCase();
  const existing = catalogue.find(c => c.name.toLowerCase() === nameKey);
  if (!existing) {
    catalogueRef().add({
      name,
      category,
      timesAdded: 1,
      lastAdded: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    catalogueRef().doc(existing.id).update({
      timesAdded: firebase.firestore.FieldValue.increment(1),
      lastAdded: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  itemInput.value = '';
  autocomplete.classList.remove('active');
  showToast(`Added "${name}" to ${category}`);
}

addBtn.addEventListener('click', () => addItem(itemInput.value));

itemInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addItem(itemInput.value);
  }
});

// ============================================================
// Autocomplete from Catalogue
// ============================================================
itemInput.addEventListener('input', () => {
  const q = itemInput.value.trim().toLowerCase();
  if (q.length < 1) {
    autocomplete.classList.remove('active');
    return;
  }

  const matches = catalogue
    .filter(c => c.name.toLowerCase().includes(q))
    .slice(0, 6);

  if (matches.length === 0) {
    autocomplete.classList.remove('active');
    return;
  }

  autocomplete.innerHTML = matches.map(m => `
    <div class="autocomplete-option" data-name="${escHtml(m.name)}">
      <span>${SECTION_ICONS[m.category] || '📦'}</span>
      <span>${escHtml(m.name)}</span>
      <span class="ac-category">${escHtml(m.category)}</span>
    </div>
  `).join('');

  autocomplete.classList.add('active');
});

autocomplete.addEventListener('click', e => {
  const opt = e.target.closest('.autocomplete-option');
  if (opt) {
    addItem(opt.dataset.name);
  }
});

document.addEventListener('click', e => {
  if (!addBar.contains(e.target)) {
    autocomplete.classList.remove('active');
  }
});

// ============================================================
// Render Shopping List
// ============================================================
function renderList() {
  // Filter by store
  let filtered = items;
  if (currentStore !== 'all') {
    filtered = items.filter(i => i.store === currentStore);
  }

  if (filtered.length === 0) {
    listContainer.innerHTML = '';
    listEmpty.style.display = '';
    return;
  }
  listEmpty.style.display = 'none';

  // Group by category
  const groups = {};
  for (const item of filtered) {
    const cat = item.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  // Sort groups by section order
  const sortedCats = SECTION_ORDER.filter(c => groups[c]);

  let html = '';
  for (const cat of sortedCats) {
    const catItems = groups[cat];
    // Sort: unchecked first, then by name
    catItems.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    html += `
      <div class="section-group">
        <div class="section-header">
          <span class="section-icon">${SECTION_ICONS[cat] || '📦'}</span>
          <span>${cat}</span>
          <span class="item-count">${catItems.length}</span>
        </div>
        ${catItems.map(item => renderItemRow(item)).join('')}
      </div>
    `;
  }

  listContainer.innerHTML = html;

  // Attach event listeners
  listContainer.querySelectorAll('.item-row').forEach(row => {
    const id = row.dataset.id;

    row.querySelector('.item-checkbox').addEventListener('click', e => {
      e.stopPropagation();
      const item = items.find(i => i.id === id);
      if (item) {
        itemsRef().doc(id).update({ checked: !item.checked });
      }
    });

    const minusBtn = row.querySelector('.qty-minus');
    const plusBtn = row.querySelector('.qty-plus');

    minusBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const item = items.find(i => i.id === id);
      if (item && item.qty > 1) {
        itemsRef().doc(id).update({ qty: item.qty - 1 });
      }
    });

    plusBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const item = items.find(i => i.id === id);
      if (item) {
        itemsRef().doc(id).update({ qty: item.qty + 1 });
      }
    });

    row.querySelector('.item-delete')?.addEventListener('click', e => {
      e.stopPropagation();
      itemsRef().doc(id).delete();
    });
  });
}

function renderItemRow(item) {
  const storeName = item.store ? stores.find(s => s.id === item.store)?.name : null;
  return `
    <div class="item-row ${item.checked ? 'checked' : ''}" data-id="${item.id}">
      <button class="item-checkbox">${item.checked ? '✓' : ''}</button>
      <div class="item-info">
        <div class="item-name">${escHtml(item.name)}</div>
        <div class="item-meta">
          ${storeName ? escHtml(storeName) + ' · ' : ''}${item.addedBy || ''}
        </div>
      </div>
      <div class="item-qty">
        <button class="qty-btn qty-minus">−</button>
        <span class="qty-value">${item.qty || 1}</span>
        <button class="qty-btn qty-plus">+</button>
      </div>
      <button class="item-delete">✕</button>
    </div>
  `;
}

// ============================================================
// Summary Bar
// ============================================================
function renderSummary() {
  let filtered = items;
  if (currentStore !== 'all') {
    filtered = items.filter(i => i.store === currentStore);
  }

  const total = filtered.length;
  const checked = filtered.filter(i => i.checked).length;

  if (total === 0) {
    summaryBar.style.display = 'none';
    return;
  }

  summaryBar.style.display = '';
  summaryText.textContent = `${checked}/${total} items checked`;
  clearChecked.style.display = checked > 0 ? '' : 'none';
}

clearChecked.addEventListener('click', () => {
  const batch = db.batch();
  const checkedItems = items.filter(i => i.checked && (currentStore === 'all' || i.store === currentStore));
  checkedItems.forEach(item => {
    batch.delete(itemsRef().doc(item.id));
  });
  batch.commit();
  showToast(`Cleared ${checkedItems.length} items`);
});

// ============================================================
// Store Chips
// ============================================================
function renderStoreChips() {
  const chipsHtml = `
    <button class="store-chip ${currentStore === 'all' ? 'active' : ''}" data-store="all">All Stores</button>
    ${stores.map(s => `
      <button class="store-chip ${currentStore === s.id ? 'active' : ''}" data-store="${s.id}">
        ${escHtml(s.name)}
      </button>
    `).join('')}
    <button class="store-chip add-store" id="btn-add-store">+ Store</button>
  `;
  storeBar.innerHTML = chipsHtml;

  // Reattach listeners
  storeBar.querySelectorAll('.store-chip:not(.add-store)').forEach(chip => {
    chip.addEventListener('click', () => {
      currentStore = chip.dataset.store;
      renderStoreChips();
      renderList();
      renderSummary();
    });
  });

  storeBar.querySelector('#btn-add-store')?.addEventListener('click', () => {
    openModal('Add Store', 'Store name (e.g. Costco, Trader Joe\'s)', 'Add', name => {
      if (name.trim()) {
        storesRef().add({
          name: name.trim(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Added store "${name.trim()}"`);
      }
    });
  });
}

// ============================================================
// Catalogue View
// ============================================================
function renderCatalogue(filter = '') {
  let filtered = catalogue;
  if (filter) {
    const q = filter.toLowerCase();
    filtered = catalogue.filter(c => c.name.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    catContainer.innerHTML = '';
    catEmpty.style.display = '';
    return;
  }
  catEmpty.style.display = 'none';

  catContainer.innerHTML = filtered.map(c => `
    <div class="catalogue-item" data-id="${c.id}">
      <span class="cat-icon">${SECTION_ICONS[c.category] || '📦'}</span>
      <div class="cat-info">
        <div class="cat-name">${escHtml(c.name)}</div>
        <div class="cat-category">${escHtml(c.category)} · added ${c.timesAdded || 1}x</div>
      </div>
      <button class="cat-add-btn">+ Add</button>
    </div>
  `).join('');

  catContainer.querySelectorAll('.cat-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.catalogue-item');
      const item = catalogue.find(c => c.id === row.dataset.id);
      if (item) addItem(item.name);
    });
  });
}

catSearch.addEventListener('input', () => {
  renderCatalogue(catSearch.value);
});

// ============================================================
// Stores Management View
// ============================================================
function renderStores() {
  if (stores.length === 0) {
    storesContainer.innerHTML = '';
    storesEmpty.style.display = '';
    return;
  }
  storesEmpty.style.display = 'none';

  const COLORS = ['#e94560', '#4ecdc4', '#f9a825', '#7c4dff', '#00bcd4', '#ff7043', '#66bb6a'];

  storesContainer.innerHTML = stores.map((s, i) => {
    const count = items.filter(item => item.store === s.id).length;
    return `
      <div class="store-manage-item" data-id="${s.id}">
        <span class="store-color" style="background:${COLORS[i % COLORS.length]}"></span>
        <span class="store-name">${escHtml(s.name)}</span>
        <span class="store-count">${count} items</span>
        <button class="item-delete" data-store-id="${s.id}">✕</button>
      </div>
    `;
  }).join('');

  storesContainer.querySelectorAll('.item-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const storeId = btn.dataset.storeId;
      if (confirm('Delete this store? Items will remain but lose their store tag.')) {
        storesRef().doc(storeId).delete();
        // Unset store from items
        items.filter(i => i.store === storeId).forEach(item => {
          itemsRef().doc(item.id).update({ store: null });
        });
        if (currentStore === storeId) currentStore = 'all';
        showToast('Store deleted');
      }
    });
  });
}

// ============================================================
// Tab Navigation
// ============================================================
tabBar.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;

  currentView = tab.dataset.view;

  tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`view-${currentView}`).classList.add('active');

  // Show/hide store bar and add bar
  storeBar.style.display = currentView === 'list' ? '' : 'none';
  summaryBar.style.display = currentView === 'list' && items.length > 0 ? '' : 'none';
  addBar.style.display = currentView === 'stores' ? 'none' : '';

  if (currentView === 'catalogue') {
    renderCatalogue(catSearch.value);
  } else if (currentView === 'stores') {
    renderStores();
  }
});

// ============================================================
// Modal
// ============================================================
let modalCallback = null;

function openModal(title, placeholder, confirmText, callback) {
  modalTitle.textContent = title;
  modalInput.placeholder = placeholder;
  modalInput.value = '';
  modalConfirm.textContent = confirmText;
  modalCallback = callback;
  modalOverlay.classList.add('active');
  setTimeout(() => modalInput.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.remove('active');
  modalCallback = null;
  modalExtra.innerHTML = '';
}

modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

modalConfirm.addEventListener('click', () => {
  if (modalCallback) modalCallback(modalInput.value);
  closeModal();
});

modalInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (modalCallback) modalCallback(modalInput.value);
    closeModal();
  }
});

// ============================================================
// Toast
// ============================================================
let toastTimeout = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// Utilities
// ============================================================
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ============================================================
// Service Worker Registration
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/shopping/sw.js').catch(() => {});
}
