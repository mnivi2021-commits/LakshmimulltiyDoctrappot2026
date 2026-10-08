/* Appointment status lookup (appointment number + registered mobile). */
(function () {
  'use strict';
  var f = document.getElementById('statusForm');
  if (!f) return;
  var out = document.getElementById('statusResult');
  var msg = document.getElementById('statusMsg');
  var t = I18N.t; var e = LMH.esc;
  var last = null;

  function show(a) {
    last = a;
    var active = ['booked', 'confirmed', 'leave_affected'].indexOf(a.status) >= 0;
    out.innerHTML = LMH.apptCard(a, a.appointment_no) +
      (a.suggested ? '<p class="alert">' + e(t('js_next_avail')) + ' ' + e(a.suggested) + '</p>' : '') +
      (active ? '<button type="button" class="btn btn-danger" id="cancelBtn">' + e(t('js_cancel_appt')) + '</button>' : '');
  }

  f.addEventListener('submit', function (ev) {
    ev.preventDefault(); msg.innerHTML = ''; out.innerHTML = '';
    LMH.api('/api/appointments/status', { appointment_no: f.appointment_no.value, mobile: f.mobile.value }).then(function (r) {
      if (!r.success) { msg.innerHTML = '<p class="alert alert-error">' + e(r.message) + '</p>'; return; }
      show(r.appointment);
    }).catch(function () { msg.innerHTML = '<p class="alert alert-error">' + e(t('js_net_error')) + '</p>'; });
  });

  out.addEventListener('click', function (ev) {
    if (!ev.target.closest('#cancelBtn') || !last) return;
    if (!window.confirm(t('js_cancel_confirm'))) return;
    LMH.api('/api/appointments/cancel', { appointment_no: f.appointment_no.value, mobile: f.mobile.value }).then(function (r) {
      if (!r.success) { msg.innerHTML = '<p class="alert alert-error">' + e(r.message) + '</p>'; return; }
      show(r.appointment);
      msg.innerHTML = '<p class="alert alert-ok">' + e(t('js_cancelled')) + '</p>';
    });
  });
})();
