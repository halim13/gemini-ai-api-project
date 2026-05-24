/**
 * @fileoverview Firebase Authentication Service.
 * Manages user registration, session sign-in/out, and profile persistence.
 * @module auth
 */

import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * Register a new user, updates their Auth display profile,
 * and saves their initial user document inside the Firestore `users` collection.
 * 
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @param {string} displayName - The user's visual profile display name.
 * @returns {Promise<import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js").User>}
 */
export async function registerUser(email, password, displayName) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name on auth profile
    await updateProfile(user, { displayName: displayName.trim() });

    // Create record inside firestore users collection
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(userDocRef, {
      uid: user.uid,
      email: email.toLowerCase().trim(),
      displayName: displayName.trim() || "User",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return user;
  } catch (error) {
    console.error("Error in registerUser service:", error);
    throw error;
  }
}

/**
 * Sign in an existing user with email and password credentials.
 * 
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js").User>}
 */
export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Error in loginUser service:", error);
    throw error;
  }
}

/**
 * Terminate the user's active session and sign out.
 * 
 * @returns {Promise<void>}
 */
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error in logoutUser service:", error);
    throw error;
  }
}

/**
 * Return the currently authenticated user user profile block or null if signed out.
 * 
 * @returns {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js").User|null}
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Bind a reactive listener to authentication state transitions (e.g. login/logout).
 * 
 * @param {function(import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js").User|null): void} callback
 * @returns {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js").Unsubscribe}
 */
export function onAuthStateChangedListener(callback) {
  return onAuthStateChanged(auth, callback);
}
