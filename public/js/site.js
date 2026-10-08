/* Shared site behaviour: language switch, mobile menu, small helpers. */
(function () {
  'use strict';
  I18N.apply();
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]');
    if (b) I18N.setLang(b.getAttribute('data-lang'));
  });
  var mb = document.querySelector('.menu-btn');
  var nav = document.getElementById('mainnav');
  if (mb && nav) {
    mb.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      mb.setAttribute('aria-expanded', String(open));
    });
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  window.LMH = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    time12: function (hhmm) {
      var p = hhmm.split(':'); var h = +p[0];
      return (h % 12 || 12) + ':' + p[1] + ' ' + (h >= 12 ? 'PM' : 'AM');
    },
    prettyDate: function (d) {
      var x = new Date(d + 'T00:00:00Z');
      return DAYS[x.getUTCDay()] + ', ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()] + ' ' + x.getUTCFullYear();
    },
    api: function (url, body) {
      var opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
      return fetch(url, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; });
      });
    },
    meta: null,
    getMeta: function () {
      if (LMH.meta) return Promise.resolve(LMH.meta);
      return LMH.api('/api/meta').then(function (m) { LMH.meta = m; return m; });
    },
    apptCard: function (a, title) {
      var e = LMH.esc; var t = I18N.t;
      return '<div class="card confirm"><h2>✅ ' + e(title || t('js_confirmed')) + '</h2>' +
        '<p class="muted">' + e(document.querySelector('[data-i18n="hospital_name"]') ? document.querySelector('[data-i18n="hospital_name"]').textContent : 'Lakshmi Multispecialty Hospital') + '</p>' +
        '<dl class="kv">' +
        '<dt>' + e(t('js_appt_no')) + '</dt><dd class="apptno">' + e(a.appointment_no) + '</dd>' +
        '<dt>' + e(t('js_doctor')) + '</dt><dd>' + e(a.doctor) + '</dd>' +
        '<dt>' + e(t('js_dept')) + '</dt><dd>' + e(a.department) + '</dd>' +
        '<dt>' + e(t('js_date')) + '</dt><dd>' + e(LMH.prettyDate(a.appointment_date)) + '</dd>' +
        '<dt>' + e(t('js_time')) + '</dt><dd>' + e(LMH.time12(a.appointment_time)) + '</dd>' +
        '<dt>' + e(t('js_patient')) + '</dt><dd>' + e(a.patient_name) + '</dd>' +
        '<dt>' + e(t('js_status')) + '</dt><dd><span class="badge ' + e(a.status) + '">' + e(t('st_' + a.status, a.status)) + '</span></dd>' +
        '</dl></div>';
    },
  };
})();
