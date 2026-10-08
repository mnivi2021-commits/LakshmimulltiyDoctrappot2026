/* Live availability viewer on the Doctor Schedule page. */
(function () {
  'use strict';
  var f = document.getElementById('schedForm');
  if (!f) return;
  var out = document.getElementById('schedResult');
  var t = I18N.t; var e = LMH.esc;

  LMH.getMeta().then(function (m) { f.date.min = m.today; f.date.value = m.today; load(); });

  function load() {
    if (!f.doctor_id.value || !f.date.value) return;
    out.innerHTML = '<p class="muted">' + e(t('js_loading')) + '</p>';
    LMH.api('/api/availability?doctor_id=' + encodeURIComponent(f.doctor_id.value) + '&date=' + encodeURIComponent(f.date.value)).then(function (r) {
      if (!r.success) { out.innerHTML = '<p class="alert alert-error">' + e(r.message) + '</p>'; return; }
      var html = '<div class="card">';
      if (r.reason_text) html += '<p class="alert">' + e(r.reason_text) + '</p>';
      (r.sessions || []).forEach(function (s) {
        html += '<div class="sess-block"><h3>' + e(t(s.session, s.session)) + ' · ' + e(LMH.time12(s.start_time)) + ' – ' + e(LMH.time12(s.end_time)) +
          ' <span class="badge">' + s.available_count + ' ' + e(t('js_free_count')) + '</span></h3><div class="slots">';
        s.slots.forEach(function (x) {
          var free = x.state === 'available';
          html += free
            ? '<a class="slot" href="/book?doctor=' + encodeURIComponent(r.doctor_id) + '">' + e(LMH.time12(x.time)) + '</a>'
            : '<span class="slot taken">' + e(LMH.time12(x.time)) + '</span>';
        });
        html += '</div></div>';
      });
      var n = (r.next_available || [])[0];
      if (n) html += '<p><b>' + e(t('js_next_avail')) + '</b> ' + e(LMH.prettyDate(n.date) + ', ' + LMH.time12(n.time)) + '</p>';
      out.innerHTML = html + '</div>';
    }).catch(function () { out.innerHTML = '<p class="alert alert-error">' + e(t('js_net_error')) + '</p>'; });
  }
  f.addEventListener('change', load);
  document.addEventListener('langchange', load);
})();
