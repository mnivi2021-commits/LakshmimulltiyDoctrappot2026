/* Website booking form — slots come live from /api/availability. */
(function () {
  'use strict';
  var f = document.getElementById('bookForm');
  if (!f) return;
  var t = I18N.t; var e = LMH.esc;
  var slotsEl = document.getElementById('slots');
  var msg = document.getElementById('formMsg');
  var result = document.getElementById('bookResult');
  var dateIn = f.appointment_date;

  LMH.getMeta().then(function (m) {
    dateIn.min = m.today;
    var max = new Date(m.today + 'T00:00:00Z'); max.setUTCDate(max.getUTCDate() + m.booking_window_days);
    dateIn.max = max.toISOString().slice(0, 10);
    if (!dateIn.value) dateIn.value = m.today;
    load();
  });

  function session() { var r = f.querySelector('input[name=session]:checked'); return r ? r.value : 'morning'; }

  function pickSlot(date, time, sess) {
    if (date !== dateIn.value) dateIn.value = date;
    var r = f.querySelector('input[name=session][value=' + sess + ']'); if (r) r.checked = true;
    f.appointment_time.value = time;
    load(time);
  }

  function load(selected) {
    f.appointment_time.value = selected || '';
    if (!f.doctor.value || !dateIn.value) { slotsEl.innerHTML = '<p class="muted">' + e(t('pick_first', 'Choose doctor and date to see free times.')) + '</p>'; return; }
    slotsEl.innerHTML = '<p class="muted">' + e(t('js_loading')) + '</p>';
    LMH.api('/api/availability?doctor_id=' + encodeURIComponent(f.doctor.value) + '&date=' + encodeURIComponent(dateIn.value)).then(function (r) {
      if (!r.success) { slotsEl.innerHTML = '<p class="alert alert-error">' + e(r.message || t('js_net_error')) + '</p>'; return; }
      var s = (r.sessions || []).filter(function (x) { return x.session === session(); })[0];
      var html = '';
      if (s && s.available_count > 0) {
        s.slots.forEach(function (x) {
          var free = x.state === 'available';
          html += '<button type="button" class="slot' + (free ? '' : ' taken') + '"' + (free ? '' : ' disabled') +
            ' data-time="' + e(x.time) + '" aria-pressed="' + (x.time === selected) + '">' + e(LMH.time12(x.time)) + '</button>';
        });
      } else {
        html = '<p class="alert">' + e(r.reason_text || t('js_no_free')) + '</p>';
        var other = (r.sessions || []).filter(function (x) { return x.session !== session() && x.available_count > 0; })[0];
        var next = (r.next_available || [])[0];
        if (other) {
          var first = other.slots.filter(function (x) { return x.state === 'available'; })[0];
          next = { date: r.date, time: first.time, session: other.session, display: LMH.prettyDate(r.date) + ' ' + LMH.time12(first.time) };
        }
        if (next) {
          html += '<p><b>' + e(t('js_next_avail')) + '</b> ' + e(LMH.prettyDate(next.date)) + ', ' + e(LMH.time12(next.time)) + '</p>' +
            '<button type="button" class="btn btn-primary" data-next="' + e(next.date + '|' + next.time + '|' + next.session) + '">' + e(t('js_book_this')) + '</button>';
        }
      }
      slotsEl.innerHTML = html;
    }).catch(function () { slotsEl.innerHTML = '<p class="alert alert-error">' + e(t('js_net_error')) + '</p>'; });
  }

  slotsEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('button.slot:not([disabled])');
    if (b) {
      slotsEl.querySelectorAll('.slot').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true'); f.appointment_time.value = b.getAttribute('data-time');
      return;
    }
    var n = ev.target.closest('[data-next]');
    if (n) { var p = n.getAttribute('data-next').split('|'); pickSlot(p[0], p[1], p[2]); }
  });
  f.doctor.addEventListener('change', function () { load(); });
  dateIn.addEventListener('change', function () { load(); });
  f.querySelectorAll('input[name=session]').forEach(function (r) { r.addEventListener('change', function () { load(); }); });
  document.addEventListener('langchange', function () { load(f.appointment_time.value); });

  f.addEventListener('submit', function (ev) {
    ev.preventDefault(); msg.innerHTML = '';
    if (!f.appointment_time.value) { msg.innerHTML = '<p class="alert alert-error">' + e(t('js_pick_time')) + '</p>'; return; }
    var data = {};
    new FormData(f).forEach(function (v, k) { data[k] = v; });
    data.language = I18N.lang();
    var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    LMH.api('/api/appointments', data).then(function (r) {
      btn.disabled = false;
      if (r.success) {
        result.innerHTML = LMH.apptCard(r.appointment) + '<p class="muted">' + e(t('js_keep_no')) + '</p>';
        f.hidden = true; result.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (r.errors) {
        msg.innerHTML = '<div class="alert alert-error">' + e(t('js_fix_errors')) + '<ul class="errs">' +
          Object.keys(r.errors).map(function (k) { return '<li>' + e(r.errors[k]) + '</li>'; }).join('') + '</ul></div>';
        return;
      }
      if (r.code === 'duplicate' && r.appointment) { result.innerHTML = '<p class="alert">' + e(r.message) + '</p>' + LMH.apptCard(r.appointment, r.appointment.appointment_no); return; }
      // Slot unavailable — show only the real alternatives from the server.
      var alts = (r.alternatives || []).map(function (a) {
        return '<button type="button" class="slot" data-next="' + e(a.date + '|' + a.time + '|' + a.session) + '">' + e(LMH.prettyDate(a.date) + ' ' + LMH.time12(a.time)) + '</button>';
      }).join('');
      msg.innerHTML = '<div class="alert alert-error">' + e(r.message || t('js_unavailable_try')) + (alts ? '<p>' + e(t('js_unavailable_try')) + '</p><div class="slots alts">' + alts + '</div>' : '') + '</div>';
      load();
    }).catch(function () { btn.disabled = false; msg.innerHTML = '<p class="alert alert-error">' + e(t('js_net_error')) + '</p>'; });
  });
  msg.addEventListener('click', function (ev) {
    var n = ev.target.closest('[data-next]');
    if (n) { var p = n.getAttribute('data-next').split('|'); msg.innerHTML = ''; pickSlot(p[0], p[1], p[2]); }
  });
})();
