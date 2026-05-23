const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');

// Array to store the conversation history to send to the backend API
let conversation = [];

// Copy to Clipboard logic for Code Blocks using Event Delegation
chatBox.addEventListener('click', async function (e) {
  if (e.target.classList.contains('copy-code-btn')) {
    const button = e.target;
    const container = button.closest('.code-container');
    if (!container) return;

    const codeElement = container.querySelector('code');
    if (!codeElement) return;

    // Use innerText to preserve line breaks exactly as they are displayed
    const textToCopy = codeElement.innerText;

    try {
      await navigator.clipboard.writeText(textToCopy);
      
      // Visual feedback
      button.textContent = 'Copied!';
      button.classList.add('copied');
      
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      button.textContent = 'Failed';
      
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }
  }
});

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  // 1. Add the user's message to the chat box
  appendMessage('user', userMessage);
  input.value = '';

  // Store user message in history
  conversation.push({ role: 'user', text: userMessage });

  // 2. Show a temporary "Thinking..." bot message
  const botMessageElement = appendMessage('bot', 'Thinking...');

  // Disable input & button to prevent duplicate submissions
  const submitButton = form.querySelector('button[type="submit"]');
  input.disabled = true;
  if (submitButton) submitButton.disabled = true;

  try {
    // 3. Send the user's message as a POST request to /api/chat
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ conversation })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 4. When the response arrives, replace "Thinking..." with the AI's reply
    if (data && data.result) {
      // Render the AI response using Markdown parsing
      botMessageElement.innerHTML = parseMarkdown(data.result);

      // Add the AI response to the history so it's sent in future requests
      conversation.push({ role: 'model', text: data.result });
    } else {
      // 5. If no result is received, show fallback message
      botMessageElement.textContent = 'Sorry, no response received.';
      // Remove failed message from history so the user can try again
      conversation.pop();
    }
  } catch (error) {
    console.error('Error fetching chat response:', error);
    // 5. If an error occurs, show error message
    botMessageElement.textContent = 'Failed to get response from server.';
    // Remove failed message from history so the user can try again
    conversation.pop();
  } finally {
    // Re-enable inputs
    input.disabled = false;
    if (submitButton) submitButton.disabled = false;
    input.focus();
    
    // Scroll chatBox to bottom in case text height changed
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});

/**
 * Creates and appends a message bubble inside a cleared wrapper to handle layout cleanly.
 * @param {'user'|'bot'} sender 
 * @param {string} text 
 * @returns {HTMLElement} The message bubble element
 */
function appendMessage(sender, text) {
  // Use a wrapper to prevent float elements from overlapping/stacking incorrectly
  const wrapper = document.createElement('div');
  wrapper.style.clear = 'both';
  wrapper.style.display = 'flow-root';
  wrapper.style.margin = '8px 0';

  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  
  // Render with markdown support if it's not a loading message
  if (text === 'Thinking...') {
    msg.textContent = text;
  } else {
    msg.innerHTML = parseMarkdown(text);
  }

  // Reset internal margins since the wrapper handles the vertical spacing
  msg.style.margin = '0';

  wrapper.appendChild(msg);
  chatBox.appendChild(wrapper);
  
  // Scroll to bottom
  chatBox.scrollTop = chatBox.scrollHeight;
  
  return msg;
}

/**
 * A lightweight, XSS-safe Markdown parser for chat messages.
 * Converts bold, italics, blockquotes, lists, and inline/block code to safe HTML.
 * @param {string} text 
 * @returns {string} Safe HTML string
 */
function parseMarkdown(text) {
  if (!text) return '';

  // 1. Escape HTML characters to prevent XSS injections
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // 2. Extract and preserve Code Blocks (```code```)
  const codeBlocks = [];
  // Pattern 1: Matches ```lang [newline] code ```
  html = html.replace(/```(\w*)\n([\s\S]+?)```/g, (match, lang, code) => {
    codeBlocks.push({
      lang: lang || 'code',
      code: code.trim()
    });
    return `@@@CODEBLOCKPLACEHOLDER${codeBlocks.length - 1}@@@`;
  });

  // Pattern 2: Fallback for ``` without lang or immediate newline
  html = html.replace(/```([\s\S]+?)```/g, (match, code) => {
    codeBlocks.push({
      lang: 'code',
      code: code.trim()
    });
    return `@@@CODEBLOCKPLACEHOLDER${codeBlocks.length - 1}@@@`;
  });

  // 3. Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 4. Blockquotes: Lines starting with &gt; (which is > escaped)
  html = html.replace(/^(?:&gt;)\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  
  // Merge adjacent blockquotes into a single blockquote
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

  // 5. Bold: **text** or __text__
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');

  // 6. Italics: *text* or _text_
  html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
  html = html.replace(/_([\s\S]+?)_/g, '<em>$1</em>');

  // 7. Unordered Lists: - item or * item
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, ''); // Clean up nested wrapper boundaries

  // 8. Paragraphs & manual linebreaks
  const segments = html.split(/\n{2,}/);
  html = segments
    .map(seg => {
      const trimmed = seg.trim();
      if (!trimmed) return '';
      // If it starts with block container tags, do not wrap in <p> to keep layout correct
      if (
        trimmed.startsWith('@@@CODEBLOCKPLACEHOLDER') || 
        trimmed.startsWith('<ul>') || 
        trimmed.startsWith('<blockquote>')
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  // 9. Restore and inject block code contents back safely wrapped in premium copy containers
  codeBlocks.forEach((item, idx) => {
    const placeholder = `@@@CODEBLOCKPLACEHOLDER${idx}@@@`;
    const codeBlockHtml = `
<div class="code-container">
  <div class="code-header">
    <span class="code-lang">${item.lang}</span>
    <button class="copy-code-btn">Copy</button>
  </div>
  <pre><code>${item.code}</code></pre>
</div>`.trim();
    html = html.split(placeholder).join(codeBlockHtml);
  });

  return html;
}
