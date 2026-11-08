/* PlayCode homepage — language hint + FAQ anchors + inquiry forms (docs/design/07-website.md §11). No dependencies. */
(function () {
  'use strict';

  // ── "This page is available in …" hint (never redirects on its own) ──────────
  try {
    var page = (document.documentElement.lang || '').toLowerCase();
    var prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map(function (l) { return String(l).toLowerCase(); });
    var dismissed = false;
    try { dismissed = localStorage.getItem('pcs.langhint') === '1'; } catch (e) { /* storage blocked */ }
    if (!dismissed && prefs[0] && prefs[0].split('-')[0] !== page.split('-')[0]) {
      var hints = document.querySelectorAll('.lang-hint[data-lang]');
      for (var i = 0; i < hints.length; i++) {
        var l = hints[i].getAttribute('data-lang');
        if (prefs.some(function (p) { return p === l || p.split('-')[0] === l.split('-')[0]; })) { hints[i].hidden = false; break; }
      }
    }
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.lang-hint-close') : null;
      if (!b) return;
      b.closest('.lang-hint').hidden = true;
      try { localStorage.setItem('pcs.langhint', '1'); } catch (err) { /* ignore */ }
    });
  } catch (e) { /* the hint is optional */ }

  // ── FAQ: a link to #<question> opens that answer ─────────────────────────────
  function openTarget() {
    try {
      var id = decodeURIComponent((location.hash || '').slice(1));
      var el = id ? document.getElementById(id) : null;
      if (el && el.tagName === 'DETAILS') el.open = true;
    } catch (e) { /* bad hash */ }
  }
  openTarget();
  window.addEventListener('hashchange', openTarget);

  // ── inquiry forms → <supabase>/functions/v1/inquiry-submit ───────────────────
  var MAX = 4000;
  var MSG = {
    ko: {
      email: '이메일 주소를 확인해 주세요.',
      message: '내용을 입력해 주세요.',
      long: '내용은 4,000자까지 쓸 수 있어요.',
      confirm: '안내를 확인했다면 체크해 주세요.',
      sending: '보내는 중이에요…',
      ok: '접수되었어요. 문의 번호는 {ticket}입니다. 답변은 입력한 이메일로 보내 드릴게요.',
      rate: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
      bad: '입력한 내용을 다시 확인해 주세요.',
      fail: '보내지 못했어요. 잠시 후 다시 시도해 주세요.',
      network: '연결에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'
    },
    en: {
      email: 'Please check your email address.',
      message: 'Please write a message.',
      long: 'Messages can be up to 4,000 characters.',
      confirm: 'Please tick the box to confirm.',
      sending: 'Sending…',
      ok: 'Thanks — we received it. Your ticket number is {ticket}. We will reply by email.',
      rate: 'Too many requests. Please try again in a moment.',
      bad: 'Please check what you entered.',
      fail: 'We could not send it. Please try again later.',
      network: 'Connection failed. Check your internet connection and try again.'
    }
  };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setup(form) {
    var locale = form.getAttribute('data-locale') || 'ko';
    var m = MSG[locale] || MSG.en;
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    var text = form.elements.namedItem('message');
    var count = form.querySelector('.count');
    function say(msg, kind) {
      status.textContent = msg;
      status.className = 'form-status' + (kind ? ' ' + kind : '');
    }
    function updateCount() {
      if (count && text) count.textContent = text.value.length.toLocaleString() + ' / ' + MAX.toLocaleString();
    }
    if (text) text.addEventListener('input', updateCount);
    updateCount();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = form.elements.namedItem('email');
      var name = form.elements.namedItem('name');
      var category = form.elements.namedItem('category');
      var hp = form.elements.namedItem('hp');
      var confirm = form.elements.namedItem('confirm');
      var problems = [];
      [email, text, confirm].forEach(function (el) { if (el) el.removeAttribute('aria-invalid'); });
      if (!email || !EMAIL.test(email.value.trim())) problems.push([email, m.email]);
      if (!text || !text.value.trim()) problems.push([text, m.message]);
      else if (text.value.length > MAX) problems.push([text, m.long]);
      if (confirm && !confirm.checked) problems.push([confirm, m.confirm]);
      if (problems.length) {
        problems.forEach(function (p) { if (p[0]) p[0].setAttribute('aria-invalid', 'true'); });
        say(problems[0][1], 'err');
        if (problems[0][0]) problems[0][0].focus();
        return;
      }
      // Bots fill the hidden field; pretend success and send nothing.
      if (hp && hp.value) {
        say(m.ok.replace('{ticket}', '—'), 'ok');
        form.reset();
        return;
      }
      var key = form.getAttribute('data-key');
      var body = {
        category: category ? category.value : 'other',
        message: text.value.trim(),
        email: email.value.trim(),
        locale: locale,
        source: 'web',
        page: form.getAttribute('data-page') || location.pathname,
        hp: ''
      };
      if (name && name.value.trim()) body.name = name.value.trim();
      button.disabled = true;
      say(m.sending, '');
      fetch(form.getAttribute('data-endpoint'), {
        method: 'POST',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data || {} }; });
      }).then(function (r) {
        if (r.status === 200 && r.data.ok) {
          say(m.ok.replace('{ticket}', r.data.ticket || '—'), 'ok');
          form.reset();
          updateCount();
        } else if (r.status === 429) {
          say(m.rate, 'err');
        } else if (r.status === 400) {
          say((r.data.error && r.data.error.message) || m.bad, 'err');
        } else {
          say(m.fail, 'err');
        }
      }, function () {
        say(m.network, 'err');
      }).then(function () { button.disabled = false; });
    });
  }

  var forms = document.querySelectorAll('form.inquiry');
  for (var j = 0; j < forms.length; j++) setup(forms[j]);
})();
