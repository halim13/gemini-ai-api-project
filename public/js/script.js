/**
 * @fileoverview Main Controller and DOM Orchestrator.
 * Links HTML templates with Firebase Auth, Firestore queries, and LLM Chat flows.
 * @module script
 */

import {
  onAuthStateChangedListener,
  registerUser,
  loginUser,
  logoutUser
} from "./auth.js"

import {
  createChat,
  deleteChat,
  listenToChats,
  listenToMessages
} from "./firestore.js"

import {executeChatFlow, executeRetryFlow} from "./chat.js"

// =========================================================================
// Application State
// =========================================================================
let currentUser = null
let activeChatId = null
let activeChats = []
let unsubscribeChats = null
let unsubscribeMessages = null
let renderedMessageCount = 0 // Track rendered messages to avoid full re-renders
let lastRetryMessage = null; // Store the last message that failed to be resent

// =========================================================================
// DOM Element Selectors
// =========================================================================
const appLoading = document.getElementById("app-loading")
const authScreen = document.getElementById("auth-screen")
const chatScreen = document.getElementById("chat-screen")

// Auth Form elements
const loginForm = document.getElementById("login-form")
const registerForm = document.getElementById("register-form")
const tabBtnLogin = document.getElementById("tab-btn-login")
const tabBtnRegister = document.getElementById("tab-btn-register")
const authAlert = document.getElementById("auth-alert")

// Dashboard/Chat Panel elements
const btnLogout = document.getElementById("btn-logout")
const btnNewChat = document.getElementById("btn-new-chat")
const chatsList = document.getElementById("chats-list")
const chatBox = document.getElementById("chat-box")
const chatForm = document.getElementById("chat-form")
const userInput = document.getElementById("user-input")
const btnSend = document.getElementById("btn-send")
const typingIndicator = document.getElementById("typing-indicator")
const activeChatTitle = document.getElementById("active-chat-title")
const userDisplayName = document.getElementById("user-display-name")
const userEmail = document.getElementById("user-email")
const userAvatarInitials = document.getElementById("user-avatar-initials")
const emptyChatState = document.getElementById("empty-chat-state")

// =========================================================================
// Initialization and Authentication Listeners
// =========================================================================

// Start reactive auth listener on startup
onAuthStateChangedListener((user) => {
  // Hide initial loading screen
  appLoading.classList.add("hidden")

  if (user) {
    currentUser = user

    // Configure user details in sidebar
    userDisplayName.textContent = user.displayName || "User"
    userEmail.textContent = user.email
    userAvatarInitials.textContent = (user.displayName || "U")
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)

    // Switch screen layouts
    authScreen.classList.add("hidden")
    chatScreen.classList.remove("hidden")

    // Establish real-time listener for user's chats
    setupChatsListener(user.uid)
  } else {
    currentUser = null
    activeChatId = null

    // Reset local cache & listeners
    cleanupListeners()
    chatsList.innerHTML = ""
    chatBox.innerHTML = ""

    // Switch layouts
    chatScreen.classList.add("hidden")
    authScreen.classList.remove("hidden")
  }
})

// Clean up Firestore Snapshot listeners
function cleanupListeners() {
  if (unsubscribeChats) {
    unsubscribeChats()
    unsubscribeChats = null
  }
  if (unsubscribeMessages) {
    unsubscribeMessages()
    unsubscribeMessages = null
  }
  renderedMessageCount = 0
  chatBox.style.opacity = '1'
}

// =========================================================================
// Real-time Firestore Listeners
// =========================================================================

/**
 * Sync active chats list in real-time.
 * 
 * @param {string} uid - The logged in user's UID.
 */
function setupChatsListener(uid) {
  cleanupListeners()

  unsubscribeChats = listenToChats(uid, (chats) => {
    activeChats = chats
    renderChatsSidebar(chats)

    // Auto-select the first chat if none is active and chats exist
    if (!activeChatId && chats.length > 0) {
      selectChat(chats[0].id)
    } else if (chats.length === 0) {
      showEmptyChatState()
    }
  })
}

/**
 * Establish message listener for selected chat.
 * 
 * @param {string} chatId - The selected Chat ID.
 */
function setupMessagesListener(chatId) {
  if (unsubscribeMessages) {
    unsubscribeMessages()
  }

  // Reset rendered count for new chat
  renderedMessageCount = 0

  // Fade out smoothly instead of wiping DOM with a spinner
  chatBox.style.opacity = '0'
  chatBox.style.transition = 'opacity 0.15s ease'

  unsubscribeMessages = listenToMessages(chatId, (messages) => {
    // Check if active chat has changed in between async loads
    if (activeChatId !== chatId) return

    if (messages.length === 0) {
      chatBox.innerHTML = ""
      chatBox.style.opacity = '1'
      showEmptyChatState()
      renderedMessageCount = 0
      return
    }

    if (emptyChatState) emptyChatState.classList.add("hidden")

    if (renderedMessageCount === 0) {
      // First load for this chat: clear and render all messages, then fade in
      chatBox.innerHTML = ""
      messages.forEach((msg) => {
        renderMessageBubble(msg.role, msg.content, msg.createdAt)
      })
      renderedMessageCount = messages.length
      scrollToBottom()
      // Fade in after DOM is painted
      requestAnimationFrame(() => {
        chatBox.style.opacity = '1'
      })
    } else if (messages.length > renderedMessageCount) {
      // Only append new messages — no flicker, no re-render
      const newMessages = messages.slice(renderedMessageCount)
      newMessages.forEach((msg) => {
        renderMessageBubble(msg.role, msg.content, msg.createdAt)
      })
      renderedMessageCount = messages.length
      scrollToBottom()
    }

    // Always check and render a retry option if the last message has no reply
    checkAndRenderRetryButton(messages)
  })
}

// =========================================================================
// Render Helper Functions
// =========================================================================

/**
 * Render active chats in the sidebar history stack.
 * 
 * @param {import("./firestore.js").ChatDoc[]} chats
 */
function renderChatsSidebar(chats) {
  chatsList.innerHTML = ""

  chats.forEach((chat) => {
    const item = document.createElement("div")
    item.className = `chat-item ${chat.id === activeChatId ? "active" : ""}`
    item.setAttribute("data-id", chat.id)

    // Inner meta components (SVG bubble + Title)
    const meta = document.createElement("div")
    meta.className = "chat-item-meta"
    meta.innerHTML = `
      <span class="chat-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </span>
      <span class="chat-item-title">${escapeHTML(chat.title)}</span>
    `

    // Action button (SVG Trash Can) to delete the chat
    const btnDelete = document.createElement("button")
    btnDelete.type = "button"
    btnDelete.className = "btn-delete-chat"
    btnDelete.title = "Hapus Obrolan"
    btnDelete.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `

    // Delete Event Binding
    btnDelete.addEventListener("click", async (e) => {
      e.stopPropagation() // Avoid choosing the chat item

      const confirmDelete = confirm("Apakah Anda yakin ingin menghapus obrolan ini beserta seluruh riwayat pesannya?")
      if (!confirmDelete) return

      try {
        await deleteChat(chat.id)

        // If the active chat was deleted, reset focus
        if (activeChatId === chat.id) {
          activeChatId = null
          chatBox.innerHTML = ""
          chatBox.style.opacity = '1'
          renderedMessageCount = 0
          activeChatTitle.textContent = "Catatan Keuangan"
          showEmptyChatState()
        }
      } catch (err) {
        alert("Gagal menghapus obrolan: " + err.message)
      }
    })

    item.appendChild(meta)
    item.appendChild(btnDelete)

    // Active Selection binding
    item.addEventListener("click", () => {
      selectChat(chat.id)
    })

    chatsList.appendChild(item)
  })
}

/**
 * Handle active chat switches.
 * 
 * @param {string} chatId
 */
function selectChat(chatId) {
  activeChatId = chatId

  // Clean any local stale error bubbles from view on chat selection
  removeLocalErrorMessages()

  // Toggle CSS active tags in sidebar immediately for instant feedback
  document.querySelectorAll(".chat-item").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-id") === chatId)
  })

  // Load chat title details
  const matchingChat = activeChats.find(c => c.id === chatId)
  if (matchingChat) {
    activeChatTitle.textContent = matchingChat.title
  }

  // Setup reactive message listener
  setupMessagesListener(chatId)
}

/**
 * Display welcoming screen when no chat is present or chat is empty.
 */
function showEmptyChatState() {
  chatBox.innerHTML = ""
  if (emptyChatState) {
    chatBox.appendChild(emptyChatState)
    emptyChatState.classList.remove("hidden")
  }
}

/**
 * Create and append a structured, formatted message bubble to the chat logs frame.
 * 
 * @param {'user'|'assistant'} role - Role of speaker.
 * @param {string} content - Unformatted markdown message.
 * @param {import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js").Timestamp} [timestamp] - Firestore time.
 */
function renderMessageBubble(role, content, timestamp) {
  const row = document.createElement("div")
  row.className = `message-row ${role === "user" ? "user" : "bot"}`

  const bubble = document.createElement("div")
  bubble.className = "message-bubble"
  bubble.innerHTML = parseMarkdown(content)

  row.appendChild(bubble)

  // Append elegant human-readable timestamps if present
  if (timestamp) {
    const timeDiv = document.createElement("div")
    timeDiv.className = "message-timestamp"
    const date = timestamp.toDate()
    timeDiv.textContent = date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit"
    })
    row.appendChild(timeDiv)
  }

  chatBox.appendChild(row)
  scrollToBottom()
}

/**
 * Remove any existing local error message bubbles from the chat container.
 */
function removeLocalErrorMessages() {
  document.querySelectorAll(".error-message-row").forEach((el) => {
    el.remove()
  })
}

/**
 * Checks if the last message in the list is from the user and has no reply.
 * If so, and we are not currently loading a response, renders a retry prompt.
 * 
 * @param {Array} messages 
 */
function checkAndRenderRetryButton(messages) {
  // Always clean up existing retry elements first
  removeLocalErrorMessages()

  if (!messages || messages.length === 0) return

  const lastMessage = messages[messages.length - 1]
  
  // If the last message is from the user AND we are not currently loading/typing
  const isCurrentlyLoading = userInput.disabled
  
  if (lastMessage.role === "user" && !isCurrentlyLoading) {
    const row = document.createElement("div")
    row.className = "message-row bot error-message-row"

    const bubble = document.createElement("div")
    bubble.className = "message-bubble error-bubble"
    bubble.style.backgroundColor = "rgba(59, 130, 246, 0.08)"
    bubble.style.border = "1px solid rgba(59, 130, 246, 0.25)"
    bubble.style.color = "var(--text-muted)"
    bubble.style.display = "flex"
    bubble.style.flexDirection = "column"
    bubble.style.gap = "12px"

    const promptText = document.createElement("div")
    promptText.className = "error-text"
    promptText.textContent = "Pesan ini belum memiliki jawaban dari asisten keuangan."
    bubble.appendChild(promptText)

    const retryBtn = document.createElement("button")
    retryBtn.type = "button"
    retryBtn.className = "btn-retry-chat btn-retry-accent"
    retryBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="retry-icon">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
      </svg>
      <span>Dapatkan Jawaban</span>
    `

    retryBtn.addEventListener("click", () => {
      handleRetry()
    })

    bubble.appendChild(retryBtn)
    row.appendChild(bubble)
    chatBox.appendChild(row)
    scrollToBottom()
  }
}

/**
 * Append a custom error message directly in the UI if an API call fails.
 * Does not write to Firestore to keep logs pure.
 * Includes a premium "Retry/Coba Lagi" reload button.
 * 
 * @param {string} text - Error message text.
 */
function renderLocalErrorMessage(text) {
  // Remove any stale errors first
  removeLocalErrorMessages()

  const row = document.createElement("div")
  row.className = "message-row bot error-message-row"

  const bubble = document.createElement("div")
  bubble.className = "message-bubble error-bubble"

  const errorText = document.createElement("div")
  errorText.className = "error-text"
  errorText.textContent = text
  bubble.appendChild(errorText)

  const retryBtn = document.createElement("button")
  retryBtn.type = "button"
  retryBtn.className = "btn-retry-chat"
  retryBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="retry-icon">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
    </svg>
    <span>Coba Lagi</span>
  `

  retryBtn.addEventListener("click", () => {
    handleRetry()
  })

  bubble.appendChild(retryBtn)
  row.appendChild(bubble)
  chatBox.appendChild(row)
  scrollToBottom()
}

/**
 * Scroll the chat box smoothly to the absolute bottom.
 */
function scrollToBottom() {
  chatBox.scrollTop = chatBox.scrollHeight
}

// =========================================================================
// Authentication Forms Handlers
// =========================================================================

// Switch tabs between Login & Register view
tabBtnLogin.addEventListener("click", () => {
  loginClick()
})

tabBtnRegister.addEventListener("click", () => {
  registerClick()
})

function loginClick() {
  tabBtnLogin.classList.add("active")
  tabBtnRegister.classList.remove("active")
  loginForm.classList.remove("hidden")
  registerForm.classList.add("hidden")
  hideAlert()
}

function resetPassword() {
  document.querySelectorAll('.toggle-password').forEach(button => {
    const input = document.getElementById(
      button.dataset.target
    )

    input.type = 'password'
    button.innerHTML = '<i class="fa fa-eye"></i>'
  })
}

function registerClick() {
  tabBtnRegister.classList.add("active")
  tabBtnLogin.classList.remove("active")
  registerForm.classList.remove("hidden")
  loginForm.classList.add("hidden")
  hideAlert()
}

// Login Form Submit handler
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  const email = document.getElementById("login-email").value.trim()
  const password = document.getElementById("login-password").value

  setAuthLoadingState(loginForm, true)
  hideAlert()

  try {
    await loginUser(email, password)
    loginForm.reset()
    resetPassword()
  } catch (error) {
    showAlert(getFriendlyAuthErrorMessage(error.code), "error")
  } finally {
    setAuthLoadingState(loginForm, false)
  }
})

// Register Form Submit handler
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  const name = document.getElementById("register-name").value.trim()
  const email = document.getElementById("register-email").value.trim()
  const password = document.getElementById("register-password").value

  if (password.length < 6) {
    showAlert("Kata sandi harus terdiri dari minimal 6 karakter.", "error")
    return
  }

  setAuthLoadingState(registerForm, true)
  hideAlert()

  try {
    await registerUser(email, password, name)
    registerForm.reset()
    loginClick()
    resetPassword()
  } catch (error) {
    showAlert(getFriendlyAuthErrorMessage(error.code), "error")
  } finally {
    setAuthLoadingState(registerForm, false)
  }
})

// Logout click trigger
btnLogout.addEventListener("click", async () => {
  const confirmLogout = confirm("Apakah Anda yakin ingin keluar?")
  if (confirmLogout) {
    try {
      await logoutUser()
    } catch (error) {
      alert("Gagal keluar: " + error.message)
    }
  }
})

// Helper: Show alert boxes inside Auth views
function showAlert(message, type = "error") {
  authAlert.textContent = message
  authAlert.className = `alert-box ${type === "success" ? "success" : ""}`
  authAlert.classList.remove("hidden")
}

function hideAlert() {
  authAlert.classList.add("hidden")
  authAlert.textContent = ""
}

// Helper: Toggle spinner and states in submit buttons during authentication
function setAuthLoadingState(formEl, isLoading) {
  const btn = formEl.querySelector(".auth-submit-btn")
  const textSpan = btn.querySelector("span")
  const spinner = btn.querySelector(".mini-spinner")

  btn.disabled = isLoading
  if (isLoading) {
    textSpan.style.opacity = "0.5"
    spinner.classList.remove("hidden")
  } else {
    textSpan.style.opacity = "1"
    spinner.classList.add("hidden")
  }
}

// =========================================================================
// Chat Interactions & Message Flow Handlers
// =========================================================================

// Click "New Chat" button to prompt for title and instantiate
btnNewChat.addEventListener("click", async () => {
  if (!currentUser) return

  const defaultTitle = `Catatan Keuangan #${activeChats.length + 1}`
  const title = prompt("Masukkan topik obrolan keuangan Anda:", defaultTitle)

  if (title === null) return // Canceled

  try {
    const newChatId = await createChat(currentUser.uid, title || defaultTitle)
    selectChat(newChatId)
  } catch (error) {
    alert("Gagal membuat obrolan baru: " + error.message)
  }
})

// Chat form submission block
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const userPrompt = userInput.value.trim()
  if (!userPrompt || !currentUser) return

  // Clear previous error messages when sending a new prompt
  removeLocalErrorMessages()

  // Ensure an active chat ID is loaded.
  // If not, automatically provision a new chat in the background
  let chatId = activeChatId
  if (!chatId) {
    try {
      chatId = await createChat(currentUser.uid, userPrompt.substring(0, 24) + "...")
      activeChatId = chatId
    } catch (error) {
      alert("Gagal membuat obrolan otomatis: " + error.message)
      return
    }
  }

  // Clear input area immediately to improve visual speed
  userInput.value = ""

  // Block form controls to avoid multi-clicks
  setInputState(true)

  // Execute the full transactional Chat Flow
  await executeChatFlow(
    chatId,
    userPrompt,
    // onThinkingStarted callback
    () => {
      showTypingIndicator(true)
    },
    // onThinkingFinished callback
    (responseContent, isSuccess) => {
      showTypingIndicator(false)
      setInputState(false)

      if (!isSuccess) {
        // Render local red bubble error details
        renderLocalErrorMessage(responseContent)
      }

      // If success, the real-time messages listener will automatically fetch the DB save and render
    }
  )
})

/**
 * Handles the click event for the "Coba Lagi" (Retry) button.
 * Clears the error bubble and retries the last transaction by calling executeRetryFlow.
 */
async function handleRetry() {
  if (!activeChatId || !currentUser) return

  // Remove the existing error messages immediately
  removeLocalErrorMessages()

  // Block form controls to avoid double submissions during retry
  setInputState(true)

  // Execute the retry flow (without adding duplicate user prompt to Firestore)
  await executeRetryFlow(
    activeChatId,
    // onThinkingStarted callback
    () => {
      showTypingIndicator(true)
    },
    // onThinkingFinished callback
    (responseContent, isSuccess) => {
      showTypingIndicator(false)
      setInputState(false)

      if (!isSuccess) {
        // If retry failed, show the error message with retry button again
        renderLocalErrorMessage(responseContent)
      }
    }
  )
}

// Suggested Prompt click bindings
document.querySelectorAll(".suggested-prompt-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    userInput.value = btn.textContent.replace(/"/g, "")
    userInput.focus()
  })
})

// Event delegation for Clipboard copies on parsed Markdown blocks
chatBox.addEventListener("click", async (e) => {
  if (e.target.classList.contains("copy-code-btn")) {
    const btn = e.target
    const codeBlock = btn.closest(".code-container").querySelector("code")

    if (!codeBlock) return

    try {
      await navigator.clipboard.writeText(codeBlock.innerText)
      btn.textContent = "Tersalin!"
      btn.classList.add("copied")

      setTimeout(() => {
        btn.textContent = "Salin"
        btn.classList.remove("copied")
      }, 2000)
    } catch (err) {
      console.error("Gagal menyalin kode:", err)
      btn.textContent = "Gagal"
      setTimeout(() => {btn.textContent = "Salin"}, 2000)
    }
  }
})

// Helper: Toggle chat panel form elements
function setInputState(disabled) {
  userInput.disabled = disabled
  btnSend.disabled = disabled
  if (!disabled) {
    userInput.focus()
  }
}

// Helper: Toggle animated typing indicator
function showTypingIndicator(show) {
  if (show) {
    typingIndicator.classList.remove("hidden")
    scrollToBottom()
  } else {
    typingIndicator.classList.add("hidden")
  }
}

// =========================================================================
// Custom XSS-safe Markdown Parser
// =========================================================================

/**
 * Safely parses raw LLM markdown into HTML elements, handling blockquotes,
 * bullet lists, code blocks, bold, italics, and lines.
 * 
 * @param {string} text - Raw input.
 * @returns {string} Fully parsed safe HTML.
 */
function parseMarkdown(text) {
  if (!text) return ""

  // 1. Double escape HTML entities to guarantee XSS prevention
  let html = text
    .replace(/&/g, "&amp")
    .replace(/</g, "&lt")
    .replace(/>/g, "&gt")
    .replace(/"/g, "&quot")
    .replace(/'/g, "&#039")

  // 2. Extract, format, and preserve block code sections (```lang ... ```)
  const codeBlocks = []
  html = html.replace(/```(\w*)\n([\s\S]+?)```/g, (match, lang, code) => {
    codeBlocks.push({
      lang: lang || "code",
      code: code.trim()
    })
    return `###CODEBLOCKPLACEHOLDER${codeBlocks.length - 1}###`
  })

  // Pattern fallback without languages
  html = html.replace(/```([\s\S]+?)```/g, (match, code) => {
    codeBlocks.push({
      lang: "code",
      code: code.trim()
    })
    return `###CODEBLOCKPLACEHOLDER${codeBlocks.length - 1}###`
  })

  // 3. Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')

  // 4. Blockquotes: lines starting with &gt (which is escaped >)
  html = html.replace(/^(?:&gt)\s*(.+)$/gm, "<blockquote>$1</blockquote>")
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, "<br>") // Merge consecutive lines

  // 5. Bold text: **text** or __text__
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/__([\s\S]+?)__/g, "<strong>$1</strong>")

  // 6. Italics text: *text* or _text_
  html = html.replace(/\*([\s\S]+?)\*/g, "<em>$1</em>")
  html = html.replace(/_([\s\S]+?)_/g, "<em>$1</em>")

  // 7. Unordered Lists: - item or * item
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>")
  // Wrap li sets under ul wrappers
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
  html = html.replace(/<\/ul>\s*<ul>/g, "") // Remove duplicate inner borders

  // 8. Construct structural paragraphs separated by double enters
  const chunks = html.split(/\n{2,}/)
  html = chunks
    .map((chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return ""
      // Skip paragraph wrappers for block nodes
      if (
        trimmed.startsWith("###CODEBLOCKPLACEHOLDER") ||
        trimmed.startsWith("<ul>") ||
        trimmed.startsWith("<blockquote>")
      ) {
        return trimmed
      }
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`
    })
    .join("")

  // 9. Re-inject code blocks securely under custom clipboard-copy containers
  codeBlocks.forEach((item, index) => {
    const placeholder = `###CODEBLOCKPLACEHOLDER${index}###`
    const codeHtml = `
      <div class="code-container">
        <div class="code-header">
          <span class="code-lang">${item.lang}</span>
          <button class="copy-code-btn">Salin</button>
        </div>
        <pre><code>${item.code}</code></pre>
      </div>
    `.trim()
    html = html.split(placeholder).join(codeHtml)
  })

  return html
}

/**
 * Escapes plain HTML utility.
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp")
    .replace(/</g, "&lt")
    .replace(/>/g, "&gt")
}

// =========================================================================
// Indonesian Localized Firebase Auth Error Mappers
// =========================================================================
function getFriendlyAuthErrorMessage(errorCode) {
  switch (errorCode) {
    case "auth/invalid-email":
      return "Format alamat email tidak valid."
    case "auth/user-disabled":
      return "Akun pengguna ini telah dinonaktifkan."
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email atau kata sandi salah. Silakan coba lagi."
    case "auth/email-already-in-use":
      return "Alamat email ini sudah terdaftar oleh pengguna lain."
    case "auth/weak-password":
      return "Kata sandi terlalu lemah. Gunakan minimal 6 karakter."
    case "auth/network-request-failed":
      return "Koneksi jaringan gagal. Periksa koneksi internet Anda."
    default:
      return "Terjadi kesalahan internal. Silakan coba beberapa saat lagi."
  }
}

document.querySelectorAll('.toggle-password').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(
      button.dataset.target
    )

    const isPassword = input.type === 'password'

    input.type = isPassword ? 'text' : 'password'
    button.innerHTML = isPassword
      ? '<i class="fa fa-eye-slash"></i>'
      : '<i class="fa fa-eye"></i>'
  })
})
