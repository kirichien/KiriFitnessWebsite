(function () {
  'use strict';

  var CONFIRM_ATTEMPTS = 8;
  var CONFIRM_DELAY_MS = 500;
  var WINDOW_START = '2026-10-19';
  var WINDOW_END = '2026-10-31';

  var form = document.getElementById('signup-form');
  if (!form) {
    return;
  }

  var config = window.WINTER_CAMP_SIGNUP || {};
  var webAppUrl = typeof config.WEB_APP_URL === 'string' ? config.WEB_APP_URL.trim() : '';
  var submitButton = form.querySelector('button[type="submit"]');
  var statusEl = form.querySelector('.form-status');
  var connectNote = form.querySelector('[data-connect-note]');
  var inputs = form.querySelectorAll('input:not([name="website"])');

  if (!webAppUrl) {
    setStatus('', 'idle');
    if (connectNote) {
      connectNote.hidden = false;
    }
    return;
  }

  inputs.forEach(function (input) {
    input.disabled = false;
  });
  if (submitButton) {
    submitButton.disabled = false;
  }
  if (connectNote) {
    connectNote.hidden = true;
  }
  setStatus('', 'idle');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (form.dataset.submitting === '1') {
      return;
    }

    var honeypot = form.querySelector('[name="website"]');
    if (honeypot && honeypot.value) {
      setStatus('已收到報名資料，老師對帳後會以 email 通知。', 'success');
      form.reset();
      return;
    }

    var name = getValue('name');
    var email = getValue('email');
    var transferLast5 = getValue('transfer-last5');

    if (!name) {
      setStatus('請填寫姓名。', 'error');
      focusField('name');
      return;
    }
    if (!isValidEmail(email)) {
      setStatus('請填寫有效的電子信箱。', 'error');
      focusField('email');
      return;
    }
    if (!/^\d{5}$/.test(transferLast5)) {
      setStatus('匯款後 5 碼須為 5 位數字。', 'error');
      focusField('transfer-last5');
      return;
    }
    if (!isAgreed()) {
      setStatus('請勾選已詳讀課程資訊與規範，並同意報名。', 'error');
      focusField('agreed');
      return;
    }

    var windowState = registrationWindowState();
    if (windowState === 'before') {
      setStatus('報名尚未開始（開放期間 10/19–10/31）。', 'error');
      return;
    }
    if (windowState === 'after') {
      setStatus('報名已截止（開放期間 10/19–10/31）。', 'error');
      return;
    }

    var id = createId();
    setSubmitting(true);
    setStatus('送出中…', 'pending');

    postSignup({
      id: id,
      name: name,
      email: email,
      transferLast5: transferLast5,
      agreed: true,
      website: ''
    })
      .then(function () {
        return confirmSignup(id);
      })
      .then(function (found) {
        if (!found) {
          throw new Error('not_confirmed');
        }
        setStatus('已收到報名資料，老師對帳後會以 email 通知。', 'success');
        form.reset();
      })
      .catch(function () {
        setStatus('送出失敗，請稍後再試，或改以 email 聯絡老師。', 'error');
      })
      .then(function () {
        setSubmitting(false);
      });
  });

  function isAgreed() {
    var field = form.elements.namedItem('agreed');
    return !!(field && field.checked);
  }

  function getValue(name) {
    var field = form.elements.namedItem(name);
    return field && typeof field.value === 'string' ? field.value.trim() : '';
  }

  function focusField(name) {
    var field = form.elements.namedItem(name);
    if (field && typeof field.focus === 'function') {
      field.focus();
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function registrationWindowState() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    var map = {};
    parts.forEach(function (part) {
      map[part.type] = part.value;
    });
    var today = map.year + '-' + map.month + '-' + map.day;
    if (today < WINDOW_START) {
      return 'before';
    }
    if (today > WINDOW_END) {
      return 'after';
    }
    return 'open';
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'wc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function setSubmitting(isSubmitting) {
    form.dataset.submitting = isSubmitting ? '1' : '0';
    if (submitButton) {
      submitButton.disabled = isSubmitting;
    }
    inputs.forEach(function (input) {
      input.disabled = isSubmitting;
    });
  }

  function setStatus(text, state) {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = text;
    statusEl.dataset.state = state || 'idle';
  }

  // Apps Script web apps often block reading POST responses cross-origin.
  // text/plain + no-cors still delivers the body; confirmation uses GET/JSONP.
  function postSignup(payload) {
    return fetch(webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
  }

  function confirmSignup(id) {
    var attempt = 0;

    function tryOnce() {
      attempt += 1;
      return jsonpConfirm(id)
        .then(function (data) {
          return !!(data && data.ok && data.found);
        })
        .catch(function () {
          return false;
        })
        .then(function (found) {
          if (found) {
            return true;
          }
          if (attempt >= CONFIRM_ATTEMPTS) {
            return false;
          }
          return wait(CONFIRM_DELAY_MS).then(tryOnce);
        });
    }

    return tryOnce();
  }

  function jsonpConfirm(id) {
    return new Promise(function (resolve, reject) {
      var callbackName = '_wcSignupCb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      var script = document.createElement('script');
      var settled = false;

      function cleanup() {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function (data) {
        cleanup();
        resolve(data || {});
      };

      script.onerror = function () {
        cleanup();
        reject(new Error('jsonp_failed'));
      };

      var timer = window.setTimeout(function () {
        cleanup();
        reject(new Error('jsonp_timeout'));
      }, 8000);

      var separator = webAppUrl.indexOf('?') === -1 ? '?' : '&';
      script.src =
        webAppUrl +
        separator +
        'id=' +
        encodeURIComponent(id) +
        '&callback=' +
        encodeURIComponent(callbackName);
      document.head.appendChild(script);
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }
})();
