/**
 * script.js
 * -----------------------------------------------------------------------
 * All client-side behavior for the CODE Pakistan Policy Assistant:
 * sending questions, rendering the streamed-in messages, citations,
 * dark/light mode, quick questions, clear chat, and a typing indicator.
 * No frameworks — vanilla DOM APIs only, per the project spec.
 * -----------------------------------------------------------------------
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const sessionId = getOrCreateSessionId();
  let isSending = false;

  // ---------------------------------------------------------------------
  // Element references
  // ---------------------------------------------------------------------
  const chatScroll = document.getElementById('chatScroll');
  const questionInput = document.getElementById('questionInput');
  const sendBtn = document.getElementById('sendBtn');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const themeToggle = document.getElementById('themeToggle');
  const iconSun = document.getElementById('iconSun');
  const iconMoon = document.getElementById('iconMoon');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const quickQuestionsEl = document.getElementById('quickQuestions');

  const tmplUser = document.getElementById('tmpl-user-message');
  const tmplAssistant = document.getElementById('tmpl-assistant-message');
  const tmplTyping = document.getElementById('tmpl-typing');

  // ---------------------------------------------------------------------
  // Session / memory helpers
  // ---------------------------------------------------------------------
  function getOrCreateSessionId() {
    // Kept in a plain JS variable + fallback to a fresh id each load — the
    // backend keeps the real memory server-side, keyed by this id.
    return 'session-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  }

  // ---------------------------------------------------------------------
  // Theme (dark / light mode)
  // ---------------------------------------------------------------------
  function initTheme() {
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(preferred);
  }

  function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    iconSun.style.display = theme === 'dark' ? 'none' : 'block';
    iconMoon.style.display = theme === 'dark' ? 'block' : 'none';
  }

  themeToggle.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });

  // ---------------------------------------------------------------------
  // Health check -> updates the status indicator in the topbar
  // ---------------------------------------------------------------------
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.vectorStoreReady) {
        statusDot.className = 'status-dot status-ready';
        statusLabel.textContent = `Knowledge base ready · ${data.chunkCount} passages indexed`;
      } else {
        statusDot.className = 'status-dot';
        statusLabel.textContent = 'Knowledge base is still loading…';
        setTimeout(checkHealth, 2000);
      }
    } catch (err) {
      statusDot.className = 'status-dot status-error';
      statusLabel.textContent = 'Unable to reach the server';
    }
  }

  // ---------------------------------------------------------------------
  // Message rendering
  // ---------------------------------------------------------------------
  function scrollToBottom() {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  function renderUserMessage(text) {
    const node = tmplUser.content.cloneNode(true);
    node.querySelector('.msg__bubble').textContent = text;
    chatScroll.appendChild(node);
    scrollToBottom();
  }

  function renderTyping() {
    const node = tmplTyping.content.cloneNode(true);
    const el = node.querySelector('.msg--typing');
    chatScroll.appendChild(node);
    scrollToBottom();
    return chatScroll.lastElementChild;
  }

  function renderCitations(container, citations) {
    if (!citations || citations.length === 0) return;
    citations.forEach((c) => {
      const stamp = document.createElement('div');
      stamp.className = 'citation-stamp';
      stamp.innerHTML = `
        <span class="citation-stamp__ring"></span>
        <span class="citation-stamp__text">
          <span class="citation-stamp__doc">${escapeHtml(c.document)}</span>
          <span class="citation-stamp__meta">${escapeHtml(c.section)} · Page ${c.page}</span>
        </span>
      `;
      container.appendChild(stamp);
    });
  }

  function renderAssistantMessage({ answer, citations, isError }) {
    const node = tmplAssistant.content.cloneNode(true);
    const bubble = node.querySelector('.msg__bubble');
    const citationsEl = node.querySelector('.msg__citations');
    const copyBtn = node.querySelector('.copy-btn');

    if (isError) {
      node.querySelector('.msg--assistant').classList.add('msg--error');
    }

    bubble.textContent = answer;
    renderCitations(citationsEl, citations);

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(answer).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.querySelector('span').textContent = 'Copied';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.querySelector('span').textContent = 'Copy';
        }, 1600);
      });
    });

    chatScroll.appendChild(node);
    scrollToBottom();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------
  // Sending a question
  // ---------------------------------------------------------------------
  async function sendQuestion(question) {
    if (isSending || !question.trim()) return;
    isSending = true;
    sendBtn.disabled = true;

    renderUserMessage(question);
    questionInput.value = '';
    autoResizeInput();

    const typingEl = renderTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId }),
      });

      const data = await res.json();
      typingEl.remove();

      if (!res.ok) {
        renderAssistantMessage({
          answer: data.error || 'Something went wrong. Please try again.',
          citations: [],
          isError: true,
        });
      } else {
        renderAssistantMessage({
          answer: data.answer,
          citations: data.citations,
          isError: false,
        });
      }
    } catch (err) {
      typingEl.remove();
      renderAssistantMessage({
        answer: 'Network error — could not reach the server. Please check your connection and try again.',
        citations: [],
        isError: true,
      });
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      questionInput.focus();
    }
  }

  // ---------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------
  function autoResizeInput() {
    questionInput.style.height = 'auto';
    questionInput.style.height = Math.min(questionInput.scrollHeight, 140) + 'px';
  }

  questionInput.addEventListener('input', autoResizeInput);

  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(questionInput.value);
    }
  });

  sendBtn.addEventListener('click', () => sendQuestion(questionInput.value));

  quickQuestionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-q');
    if (!btn) return;
    sendQuestion(btn.dataset.q);
  });

  // ---------------------------------------------------------------------
  // Clear conversation
  // ---------------------------------------------------------------------
  clearChatBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch (err) {
      // Non-fatal — the UI clears regardless.
    }
    // Remove every rendered message but keep the welcome card.
    document.querySelectorAll('.msg').forEach((el) => el.remove());
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  initTheme();
  checkHealth();
  questionInput.focus();
})();
