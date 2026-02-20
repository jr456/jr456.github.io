# Shopping List App — Firebase Setup Guide

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project**
3. Name it (e.g., "family-shopping-list")
4. Disable Google Analytics (optional), click **Create Project**

## 2. Enable Google Authentication

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click **Google**, toggle **Enable**
3. Set a support email, click **Save**

## 3. Create Cloud Firestore Database

1. Go to **Firestore Database** > **Create database**
2. Choose **Start in production mode**
3. Select a region close to you
4. Once created, go to **Rules** tab and paste the contents of `firestore.rules`
5. **Replace the email addresses** in the rules with your actual Google account emails
6. Click **Publish**

## 4. Register a Web App

1. In Firebase Console, click the **gear icon** > **Project settings**
2. Scroll down to **Your apps**, click the **Web** icon (`</>`)
3. Name it "Shopping List", click **Register app**
4. Copy the `firebaseConfig` object

## 5. Update the App Config

1. Open `js/app.js`
2. Replace the `FIREBASE_CONFIG` object (around line 18) with your copied config:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 6. Add Authorized Domain

1. In Firebase Console, go to **Authentication** > **Settings** > **Authorized domains**
2. Add `jr456.github.io` (or your custom domain)

## 7. Deploy

Push to GitHub and your app will be live at:
```
https://jr456.github.io/shopping/
```

## 8. Install as App

### Android
- Open Chrome, navigate to the URL
- Tap the **three dots** menu > **Add to Home screen**

### iPhone
- Open Safari, navigate to the URL
- Tap the **Share** button > **Add to Home Screen**

## Firestore Data Structure

```
households/
  family/
    items/
      {itemId}/
        name: "Milk"
        category: "Dairy & Eggs"
        qty: 1
        checked: false
        store: null | "storeId"
        addedBy: "John"
        createdAt: timestamp
    catalogue/
      {itemId}/
        name: "Milk"
        category: "Dairy & Eggs"
        timesAdded: 5
        lastAdded: timestamp
    stores/
      {storeId}/
        name: "Costco"
        createdAt: timestamp
```
