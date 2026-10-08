/* AI Chat Receptionist widget. All logic and data live on the server
   (/api/chat → same booking service as the voice agent). No keys here. */
(function () {
  'use strict';
  var fab = document.getElementById('chatFab');
  if (!fab) return;
  var t = I18N.t;
  var state = null; var panel; var log; var btns; var form; var input; var busy = false; var started = false;
  try { state = sessionStorage.getItem('lmh_chat_state'); } catch (e) { /* ignore */ }

  var LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#fff"/><path fill="#4b3fb5" d="M20 10h8v10h10v8H28v10h-8V28H10v-8h10z"/><circle cx="24" cy="24" r="3.2" fill="#f0a830"/></svg>';

  function build() {
    panel = document.createElement('section');
    panel.id = 'chatPanel'; panel.className = 'chat-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'chatTitle');
    panel.innerHTML =
      '<header class="chat-head">' + LOGO +
      '<div class="chat-title"><strong id="chatTitle" data-i18n="hospital_name">Lakshmi Multispecialty Hospital</strong><small><span data-i18n="chat_title">AI Receptionist</span> · <span data-i18n="chat_online">Online</span></small></div>' +
      '<button type="button" class="chat-x" aria-label="Close chat">×</button></header>' +
      '<div class="chat-langs" role="group" aria-label="Language"><button type="button" data-chat-lang="ta" lang="ta">தமிழ்</button><button type="button" data-chat-lang="en">English</button><button type="button" data-chat-lang="hi" lang="hi">हिंदी</button></div>' +
      '<div class="chat-log" role="log" aria-live="polite"></div>' +
      '<div class="chat-btns"></div>' +
      '<form class="chat-form" autocomplete="off"><label class="hp" for="chatInput">Message</label><input id="chatInput" maxlength="500" enterkeyhint="send"><button type="submit" data-i18n="chat_send">Send</button></form>' +
      '<div class="chat-foot"><a href="/book" data-i18n="chat_book">📅 Book</a><a href="/call" aria-label="Call AI receptionist" data-i18n="chat_call">📞 AI Call</a><button type="button" class="chat-restart" data-i18n="chat_restart">↺ Restart</button></div>';
    document.body.appendChild(panel);
    log = panel.querySelector('.chat-log'); btns = panel.querySelector('.chat-btns');
    form = panel.querySelector('.chat-form'); input = panel.querySelector('#chatInput');
    panel.querySelector('.chat-x').addEventListener('click', close);
    panel.querySelector('.chat-restart').addEventListener('click', function () { log.innerHTML = ''; send({ action: 'menu' }); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim(); if (!v || busy) return;
      bubble(v, 'me'); input.value = '';
      send({ message: v });
    });
    panel.querySelector('.chat-langs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-chat-lang]'); if (!b) return;
      I18N.setLang(b.getAttribute('data-chat-lang'));
      send({ action: 'menu' });
    });
    btns.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b || busy) return;
      bubble(b.textContent, 'me');
      send({ action: b.getAttribute('data-v') });
    });
    syncLang();
    I18N.apply();
  }

  function syncLang() {
    if (!panel) return;
    input.placeholder = t('chat_placeholder');
    var l = I18N.lang();
    panel.querySelectorAll('[data-chat-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-chat-lang') === l)); });
  }
  document.addEventListener('langchange', syncLang);

  function bubble(text, who) {
    var d = document.createElement('div');
    d.className = 'msg ' + who; d.textContent = text;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  function card(m) {
    var d = document.createElement('div'); d.className = 'msg bot card-msg';
    var h = document.createElement('h4'); h.textContent = m.title; d.appendChild(h);
    var dl = document.createElement('dl');
    (m.rows || []).forEach(function (r) {
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
    d.appendChild(dl); log.appendChild(d);
  }
  function typing(on) {
    var x = log.querySelector('.typing');
    if (on && !x) { x = document.createElement('div'); x.className = 'msg bot typing'; x.setAttribute('aria-label', '…'); x.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(x); }
    if (!on && x) x.remove();
    log.scrollTop = log.scrollHeight;
  }
  function safeHref(h) { return /^\/[a-z0-9/_?=&-]*$/i.test(h) || /^https:\/\//i.test(h) ? h : '#'; }

  function render(res) {
    (res.messages || []).forEach(function (m) { if (m.type === 'card') card(m); else bubble(m.text, 'bot'); });
    btns.innerHTML = '';
    (res.buttons || []).forEach(function (b) {
      var el = document.createElement('button'); el.type = 'button'; el.textContent = b.label; el.setAttribute('data-v', b.value);
      btns.appendChild(el);
    });
    (res.links || []).forEach(function (l) {
      var a = document.createElement('a'); a.textContent = l.label; a.href = safeHref(l.href);
      if (/^https:/.test(a.href) && a.host !== location.host) { a.target = '_blank'; a.rel = 'noopener'; }
      if (l.href === '/call') a.className = 'call';
      btns.appendChild(a);
    });
    input.type = res.input === 'tel' ? 'tel' : 'text';
    input.inputMode = res.input === 'tel' ? 'numeric' : 'text';
    log.scrollTop = log.scrollHeight;
  }

  function send(payload) {
    busy = true; typing(true);
    payload.state = state; payload.lang = payload.message ? undefined : I18N.lang();
    LMH.api('/api/chat', payload).then(function (res) {
      typing(false); busy = false;
      if (!res || !res.messages) { bubble(t('js_net_error'), 'bot'); return; }
      state = res.state;
      try { sessionStorage.setItem('lmh_chat_state', state); } catch (e) { /* ignore */ }
      if (res.lang && res.lang !== I18N.lang()) I18N.setLang(res.lang);
      render(res);
    }).catch(function () { typing(false); busy = false; bubble(t('js_net_error'), 'bot'); });
  }

  function open() {
    if (!panel) build();
    panel.hidden = false; fab.hidden = true; document.body.classList.add('chat-open');
    if (!started) { started = true; state = null; send({ action: 'menu' }); }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() {
    panel.hidden = true; fab.hidden = false; document.body.classList.remove('chat-open'); fab.focus();
  }
  fab.addEventListener('click', open);
  document.addEventListener('click', function (e) { if (e.target.closest('[data-open-chat]')) open(); });
})();
