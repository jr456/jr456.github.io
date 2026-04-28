# 🛒 Shared Shopping List

A two-person shopping app hosted on GitHub Pages. Items added from either
account flow into a shared list, get auto-bucketed into supermarket sections,
and feed a household catalogue you can re-add from later. Lists can be tagged
with a specific store.

- **Auth:** Google sign-in, restricted to an email allowlist
- **Storage:** Firestore (real-time sync between both accounts)
- **Hosting:** GitHub Pages — no build step, no server

## One-time setup

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> → **Add project** → name it
   anything (e.g. `shopping-list`). Disable Google Analytics if you don't
   want it.
2. In **Build → Authentication → Sign-in method**, enable **Google**.
3. In **Build → Firestore Database**, click **Create database**, start in
   **production** mode, pick a region near you.
4. In **Project settings → General → Your apps**, click the `</>` icon
   to add a Web app. Skip Hosting. Copy the `firebaseConfig` object.

### 2. Plug values into the repo

- Open `js/config.js` and:
  - Paste the `firebaseConfig` values into `FIREBASE_CONFIG`.
  - Put both Google account emails (lowercased) into `ALLOWED_EMAILS`.
  - Optionally change `HOUSEHOLD_ID` (any string; both users use the same).

- Open `firestore.rules` and replace the two example emails with the same
  ones from `ALLOWED_EMAILS`. Then in Firebase console go to
  **Firestore → Rules**, paste the file's contents in, and **Publish**.

### 3. Authorize the GitHub Pages domain

Firebase blocks sign-in popups from unknown origins. In the console:

- **Authentication → Settings → Authorized domains** → **Add domain**
- Add `jr456.github.io` (and `localhost` if you want to test locally).

### 4. Deploy

The site is served from the repo root, so as soon as `index.html` lands on
the default branch, GitHub Pages picks it up at
<https://jr456.github.io/>. (If your Pages source is set to a subfolder,
move the files or change the source under **Settings → Pages**.)

## Using it

- **Add an item:** type into the box. As you type, the section it'll be
  bucketed into shows underneath. Hit Enter.
- **Auto-bucketing:** items match a built-in keyword dictionary
  (`js/sections.js`). If something lands in the wrong section, tap the
  pencil on the row and pick a section — your choice is saved to the
  catalogue and used next time.
- **Catalogue:** every item you add is remembered. The Catalogue tab lets
  you search and re-add anything in one tap.
- **Stores:** in the Stores tab, add the supermarkets you go to. From any
  store row, "Tag current list" attaches that store to the active list.
  When you create a new list (＋), you can also pick a store at creation.
- **Multiple lists:** the dropdown next to ＋ switches between lists.
  Useful for keeping a "Costco run" separate from a "Trader Joe's run".

## Local development

No build step. To run locally:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(Add `localhost` to Firebase's authorized domains first.)

## Files

```
index.html              # app shell
css/styles.css          # styles (light + dark)
js/config.js            # ← edit this with your Firebase + allowlist
js/firebase.js          # Firebase SDK init
js/auth.js              # Google sign-in + allowlist check
js/sections.js          # supermarket sections + keyword bucketing
js/db.js                # Firestore CRUD
js/app.js               # UI controller
firestore.rules         # ← paste into Firebase console after editing
```

## Security notes

- The Firebase config in `js/config.js` is public — it ships in the
  client bundle. That's expected. Real protection comes from the
  Firestore rules + the email allowlist.
- The allowlist exists in two places (client `config.js` and server
  `firestore.rules`). The client check just gives a friendly error
  immediately; the server check is the actual security boundary, so keep
  both lists in sync.
