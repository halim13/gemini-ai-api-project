/**
 * @fileoverview Firestore Database Service.
 * Implements real-time listeners, document CRUD operations, and transaction-safe batch deletes.
 * @module firestore
 */

import { db } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * Message document schema in subcollection chats/{chatId}/messages.
 * @typedef {Object} MessageDoc
 * @property {string} id - The generated message document ID.
 * @property {'user'|'assistant'} role - The speaker's role.
 * @property {string} content - The textual message body.
 * @property {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js").Timestamp} createdAt - Server creation timestamp.
 */

/**
 * Chat document schema in chats collection.
 * @typedef {Object} ChatDoc
 * @property {string} id - The generated chat document ID.
 * @property {string} userId - The Firebase UID of the owner.
 * @property {string} title - The name/title of the conversation.
 * @property {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js").Timestamp} createdAt - Server creation timestamp.
 * @property {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js").Timestamp} updatedAt - Server update timestamp.
 */

/**
 * Create a new chat document in the `chats` collection.
 * 
 * @param {string} userId - The current user's UID.
 * @param {string} title - The title/topic of the chat.
 * @returns {Promise<string>} The newly created chat document ID.
 */
export async function createChat(userId, title) {
  try {
    const chatRef = doc(collection(db, "chats"));
    const chatData = {
      id: chatRef.id,
      userId,
      title: title.trim() || "Financial Planning",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(chatRef, chatData);
    return chatRef.id;
  } catch (error) {
    console.error("Error creating chat:", error);
    throw error;
  }
}

/**
 * Delete a chat document and its message subcollection items cleanly using a write batch.
 * Prevents orphaned documents in Firestore.
 * 
 * @param {string} chatId - The ID of the chat to delete.
 * @returns {Promise<void>}
 */
export async function deleteChat(chatId) {
  try {
    // 1. Fetch all messages in the chats/{chatId}/messages subcollection
    const messagesRef = collection(db, "chats", chatId, "messages");
    const messagesSnapshot = await getDocs(messagesRef);

    // 2. Perform a batched write to delete messages and the parent chat document
    const batch = writeBatch(db);
    messagesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // 3. Delete the parent chat document itself
    const chatDocRef = doc(db, "chats", chatId);
    batch.delete(chatDocRef);

    // 4. Commit the operations atomically
    await batch.commit();
  } catch (error) {
    console.error("Error deleting chat & its messages:", error);
    throw error;
  }
}

/**
 * Update the title of a specific chat document.
 * 
 * @param {string} chatId - The ID of the chat to rename.
 * @param {string} newTitle - The new title.
 * @returns {Promise<void>}
 */
export async function renameChat(chatId, newTitle) {
  try {
    const chatRef = doc(db, "chats", chatId);
    await setDoc(chatRef, { title: newTitle.trim(), updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("Error renaming chat:", error);
    throw error;
  }
}


/**
 * Update the `updatedAt` timestamp of a specific chat.
 * 
 * @param {string} chatId - The ID of the chat.
 * @returns {Promise<void>}
 */
export async function updateChatTimestamp(chatId) {
  try {
    const chatRef = doc(db, "chats", chatId);
    await setDoc(chatRef, { updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("Error updating chat timestamp:", error);
    throw error;
  }
}

/**
 * Save a message (either from user or assistant) into chats/{chatId}/messages.
 * 
 * @param {string} chatId - The target chat ID.
 * @param {'user'|'assistant'} role - The role of the sender.
 * @param {string} content - The message content.
 * @returns {Promise<string>} The created message document ID.
 */
export async function saveMessage(chatId, role, content) {
  try {
    const messageRef = doc(collection(db, "chats", chatId, "messages"));
    const messageData = {
      id: messageRef.id,
      role,
      content,
      createdAt: serverTimestamp()
    };
    await setDoc(messageRef, messageData);
    
    // Also trigger timestamp update on the parent chat document
    await updateChatTimestamp(chatId);
    
    return messageRef.id;
  } catch (error) {
    console.error("Error saving message:", error);
    throw error;
  }
}

/**
 * Retrieve all messages for a specific chat once, sorted chronologically.
 * 
 * @param {string} chatId - The chat ID.
 * @returns {Promise<MessageDoc[]>} Chronological list of message documents.
 */
export async function getMessagesOnce(chatId) {
  try {
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error retrieving messages once:", error);
    throw error;
  }
}

/**
 * Establish a real-time Firestore listener for all chats owned by a user, sorted by last updated.
 * 
 * @param {string} userId - The Firebase UID of the owner.
 * @param {function(ChatDoc[]): void} callback - Fired whenever data updates.
 * @returns {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js").Unsubscribe} Unsubscribe function.
 */
export function listenToChats(userId, callback) {
  const chatsRef = collection(db, "chats");
  const q = query(
    chatsRef,
    where("userId", "==", userId),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map(doc => doc.data());
    callback(chats);
  }, (error) => {
    console.error("Chats real-time sync failed:", error);
  });
}

/**
 * Establish a real-time Firestore listener for messages in a chat, sorted chronologically.
 * 
 * @param {string} chatId - The ID of the chat.
 * @param {function(MessageDoc[]): void} callback - Fired whenever new messages sync.
 * @returns {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js").Unsubscribe} Unsubscribe function.
 */
export function listenToMessages(chatId, callback) {
  const messagesRef = collection(db, "chats", chatId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => doc.data());
    callback(messages);
  }, (error) => {
    console.error("Messages real-time sync failed:", error);
  });
}
