/**
 * @fileoverview Firebase initialization and service layer bootstrap.
 * Uses top-level await to retrieve client configuration securely from the Express backend,
 * with graceful placeholder fallbacks for manual edits.
 * @module firebase
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * Firebase Client Configuration structure.
 * @typedef {Object} FirebaseConfig
 * @property {string} apiKey
 * @property {string} authDomain
 * @property {string} projectId
 * @property {string} storageBucket
 * @property {string} messagingSenderId
 * @property {string} appId
 */

/** @type {FirebaseConfig} */
let firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

try {
  // Retrieve Firebase keys from Express API endpoint asynchronously
  const response = await fetch('/api/config');
  if (response.ok) {
    const remoteConfig = await response.json();
    // Only override if valid properties are fetched
    if (remoteConfig.apiKey) {
      firebaseConfig = remoteConfig;
    }
  } else {
    console.warn(`Config endpoint returned status ${response.status}. Using fallback config.`);
  }
} catch (error) {
  console.warn("Could not fetch Firebase configuration from backend. Using local fallbacks.", error);
}

// Validation check for developers
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.projectId;
if (!isConfigValid) {
  console.warn(
    "WARNING: Firebase configuration is empty! Please replace the values in the root .env file, " +
    "or edit public/js/firebase.js with hardcoded client keys."
  );
}

// Initialize Firebase Application
const app = initializeApp(firebaseConfig);

// Initialize Firebase Core Services
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
