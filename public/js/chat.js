/**
 * @fileoverview Chat Flow Service.
 * Orchestrates sending user messages, fetching conversational history,
 * mapping roles to backend specs, hitting the AI API, and persisting replies.
 * @module chat
 */

import { saveMessage, getMessagesOnce } from "./firestore.js";

/**
 * Backend Message representation.
 * @typedef {Object} BackendMessage
 * @property {'user'|'model'} role - The speaker's role expected by Gemini.
 * @property {string} text - The raw text of the message.
 */

/**
 * Executes the full chat transaction flow.
 * 
 * Flow:
 * 1. Save user's prompt to Firestore.
 * 2. Transition UI to "Thinking..." state via callback.
 * 3. Retrieve complete historical message timeline for the active chat session.
 * 4. Translate messages to backend validation format (mapping 'assistant' -> 'model').
 * 5. POST payload to /api/chat.
 * 6. Save AI's response to Firestore (which updates parent timestamp and fires sync listeners).
 * 
 * @param {string} chatId - The ID of the active chat.
 * @param {string} userMessageText - The text typed by the user.
 * @param {function(): void} onThinkingStarted - Callback when the API call is initiated.
 * @param {function(string, boolean): void} onThinkingFinished - Callback when completed. Arguments: (text, isSuccess)
 * @returns {Promise<void>}
 */
export async function executeChatFlow(chatId, userMessageText, onThinkingStarted, onThinkingFinished) {
  try {
    // 1. Save user message to Firestore with role 'user'
    await saveMessage(chatId, "user", userMessageText);

    // 2. Fire callback to show "Thinking..." loading indicator in the DOM
    onThinkingStarted();

    // 3. Load all historical messages for this conversation to feed the LLM context
    const history = await getMessagesOnce(chatId);

    // 4. Map Firestore schemas to backend specification:
    //    Firestore stores: { role: 'user' | 'assistant', content: string }
    //    Backend expects: { role: 'user' | 'model', text: string }
    const conversationPayload = history.map((msg) => {
      // Map 'assistant' role to 'model', which is strictly verified by Express app.post('/api/chat')
      const backendRole = msg.role === "assistant" ? "model" : "user";
      return {
        role: backendRole,
        text: msg.content
      };
    });

    // 5. Send POST request to /api/chat
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ conversation: conversationPayload })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 6. Inspect response content and finalize UI/Firestore transaction
    if (data && data.result && data.result.trim()) {
      const aiReply = data.result.trim();
      
      // Save AI's reply to Firestore (real-time listeners will display this in the UI automatically)
      await saveMessage(chatId, "assistant", aiReply);
      
      // Notify UI that thinking is complete with the successful response
      onThinkingFinished(aiReply, true);
    } else {
      // Empty response handler
      onThinkingFinished("Sorry, no response received.", false);
    }
  } catch (error) {
    console.error("Chat flow execution failed:", error);
    // Error handler
    onThinkingFinished("Failed to get response from server.", false);
  }
}
