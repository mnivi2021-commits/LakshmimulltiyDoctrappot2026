/* Admin dashboard (single page). Session is an HttpOnly cookie; every
   state-changing request carries X-Requested-With: lmh-admin. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var S = { tab: 'appointments', view: 'today', doctors: [], filters: {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function t12(h) { if (!h) return ''; var p = h.split(':'); var x = +p[0]; return (x % 12 || 12) + ':' + p[1] + ' ' + (x >= 12 ? 'PM' : 'AM'); }
  function api(method, url, body) {
    return fetch(url, {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lmh-admin' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url.indexOf('/login') < 0) { loginView(); throw new Error('auth'); }
        j._status = r.status; return j;
      });
    });
  }
  function toast(text, ok) {
    var d = document.createElement('div'); d.className = 'toast ' + (ok ? 'ok' : 'err'); d.textContent = text;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 4000);
  }

  // ---------- login ----------
  function loginView(msg) {
    app.innerHTML = '<div class="wrap section narrow"><div class="card form"><h1>Admin login</h1><p class="muted">Lakshmi Multispecialty Hospital</p>' +
      (msg ? '<p class="alert alert-error">' + esc(msg) + '</p>' : '') +
      '<form id="login"><label><span>Username</span><input name="username" autocomplete="username" required></label>' +
      '<label><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn btn-primary btn-xl">Log in</button></form></div></div>';
    document.getElementById('login').addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/api/admin/login', { username: e.target.username.value, password: e.target.password.value }).then(function (r) {
        if (r.success) boot(); else loginView(r.message);
      });
    });
  }

  // ---------- shell ----------
  var TABS = [['appointments', 'Appointments'], ['slots', 'Available slots'], ['leave', 'Doctor leave'], ['notifications', 'WhatsApp status'], ['voice', 'AI voice calls'], ['requests', 'Staff requests']];

  function shell() {
    app.innerHTML =
      '<header class="adm-top"><div class="wrap adm-top-in"><strong>Lakshmi Hospital · Admin</strong><a href="/" class="muted">Website</a><button class="btn" id="logout">Log out</button></div></header>' +
      '<div class="wrap"><div id="summary" class="stats"></div>' +
      '<nav class="tabs">' + TABS.map(function (x) { return '<button data-tab="' + x[0] + '" aria-pressed="' + (S.tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</nav>' +
      '<div id="panel"></div></div>';
    document.getElementById('logout').addEventListener('click', function () { api('POST', '/api/admin/logout').then(loginView); });
    app.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      S.tab = b.getAttribute('data-tab'); shell(); render();
    });
    summary();
  }

  function summary() {
    api('GET', '/api/admin/summary').then(function (r) {
      var c = r.counts || {}; var i = r.integrations || {};
      var box = function (n, l, view) { return '<button class="stat" data-view="' + view + '"><b>' + n + '</b><span>' + l + '</span></button>'; };
      document.getElementById('summary').innerHTML =
        box(c.today, "Today's", 'today') + box(c.tomorrow, "Tomorrow's", 'tomorrow') + box(c.upcoming, 'Upcoming', 'upcoming') +
        box(c.pending_confirmation, 'Awaiting confirmation', 'upcoming') + box(c.ai_voice, 'AI voice (upcoming)', 'voice') +
        box(c.leave_affected, 'Doctor-leave affected', 'attention') + box(c.open_staff_requests, 'Open staff requests', 'requests') +
        box(c.notifications_failed, 'WhatsApp not sent', 'notifications') +
        '<p class="integr">WhatsApp: <b>' + esc(i.whatsapp) + '</b> · OmniDimension webhook: <b>' + esc(i.omnidimension_webhook) + '</b> · Patient WhatsApp: <b>' + (i.patient_whatsapp ? 'on' : 'off') + '</b></p>';
    });
  }
  app.addEventListener('click', function (e) {
    var s = e.target.closest('.stat'); if (!s) return;
    var v = s.getAttribute('data-view');
    if (v === 'requests' || v === 'notifications') S.tab = v === 'requests' ? 'requests' : 'notifications';
    else { S.tab = 'appointments'; S.view = v; }
    shell(); render();
  });

  function render() {
    ({ appointments: renderAppointments, slots: renderSlots, leave: renderLeave, notifications: renderNotifications, voice: renderVoice, requests: renderRequests })[S.tab]();
  }
  function doctorOptions(sel, any) {
    return (any ? '<option value="">All doctors</option>' : '') + S.doctors.map(function (d) { return '<option value="' + d.id + '"' + (String(sel) === String(d.id) ? ' selected' : '') + '>' + esc(d.name) + ' – ' + esc(d.department) + '</option>'; }).join('');
  }

  // ---------- appointments ----------
  var VIEWS = [['today', "Today"], ['tomorrow', 'Tomorrow'], ['upcoming', 'Upcoming'], ['voice', 'AI voice bookings'], ['attention', 'Leave affected'], ['all', 'All / search']];

  function renderAppointments() {
    var f = S.filters;
    var p = document.getElementById('panel');
    p.innerHTML =
      '<div class="views">' + VIEWS.map(function (v) { return '<button data-view2="' + v[0] + '" aria-pressed="' + (S.view === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div>' +
      '<form id="filters" class="filters card">' +
      '<input name="q" placeholder="Search name / mobile / LMH-0001" value="' + esc(f.q || '') + '">' +
      '<select name="doctor_id">' + doctorOptions(f.doctor_id, true) + '</select>' +
      '<input type="date" name="date" value="' + esc(f.date || '') + '">' +
      '<select name="status"><option value="">Any status</option>' + ['active', 'booked', 'confirmed', 'leave_affected', 'cancelled', 'completed'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-primary">Filter</button><button type="button" class="btn" id="clearF">Clear</button></form>' +
      '<div id="list" class="table-wrap"><p class="muted">Loading…</p></div>';
    p.querySelector('.views').addEventListener('click', function (e) {
      var b = e.target.closest('[data-view2]'); if (!b) return; S.view = b.getAttribute('data-view2'); renderAppointments();
    });
    document.getElementById('filters').addEventListener('submit', function (e) {
      e.preventDefault(); var fd = new FormData(e.target); S.filters = {}; fd.forEach(function (v, k) { if (v) S.filters[k] = v; });
      if (S.filters.date || S.filters.q) S.view = 'all';
      renderAppointments();
    });
    document.getElementById('clearF').addEventListener('click', function () { S.filters = {}; renderAppointments(); });
    loadList();
  }

  function loadList() {
    var q = new URLSearchParams(S.filters); if (S.view !== 'all') q.set('view', S.view);
    api('GET', '/api/admin/appointments?' + q.toString()).then(function (r) {
      var rows = r.appointments || [];
      var el = document.getElementById('list');
      if (!rows.length) { el.innerHTML = '<p class="card muted">No appointments.</p>'; return; }
      el.innerHTML = '<table class="adm-table"><thead><tr><th>No</th><th>Date / time</th><th>Patient</th><th>Doctor</th><th>Reason</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        rows.map(function (a) {
          var active = ['booked', 'confirmed', 'leave_affected'].indexOf(a.status) >= 0;
          return '<tr><td><b>' + esc(a.appointment_no) + '</b></td>' +
            '<td>' + esc(a.appointment_date) + '<br>' + t12(a.appointment_time) + ' <small>(' + esc(a.session) + ')</small>' +
            (a.suggested_date ? '<br><small class="warn">Suggest: ' + esc(a.suggested_date) + ' ' + t12(a.suggested_time) + '</small>' : '') + '</td>' +
            '<td>' + esc(a.patient_name) + '<br><small>' + esc(a.mobile) + ' · ' + esc(a.patient_type) + '</small></td>' +
            '<td>' + esc(a.doctor) + '<br><small>' + esc(a.department) + '</small></td>' +
            '<td>' + esc(a.reason) + '</td><td>' + esc(a.source) + (a.language ? '<br><small>' + esc(a.language) + '</small>' : '') + '</td>' +
            '<td><span class="badge ' + esc(a.status) + '">' + esc(a.status) + '</span></td>' +
            '<td class="acts">' +
            (a.status === 'booked' ? '<button data-act="confirm" data-id="' + a.id + '">Confirm</button>' : '') +
            (a.suggested_date && active ? '<button data-act="suggest" data-id="' + a.id + '">Move to suggested</button>' : '') +
            (active ? '<button data-act="resched" data-id="' + a.id + '" data-doc="' + a.doctor_id + '">Reschedule</button><button data-act="cancel" data-id="' + a.id + '" class="danger">Cancel</button>' : '') +
            '</td></tr>';
        }).join('') + '</tbody></table>';
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var id = b.getAttribute('data-id'); var act = b.getAttribute('data-act');
    var done = function (r) { toast(r.success ? 'Saved' : (r.message || 'Failed'), r.success); summary(); loadList(); };
    if (act === 'confirm') api('POST', '/api/admin/appointments/' + id + '/confirm').then(done);
    if (act === 'suggest') api('POST', '/api/admin/appointments/' + id + '/apply-suggestion').then(done);
    if (act === 'cancel') {
      var reason = window.prompt('Cancel reason (optional):', '');
      if (reason !== null) api('POST', '/api/admin/appointments/' + id + '/cancel', { reason: reason }).then(done);
    }
    if (act === 'resched') reschedDialog(id, b.getAttribute('data-doc'));
  });

  function reschedDialog(id, doctorId) {
    var d = document.createElement('div'); d.className = 'modal';
    d.innerHTML = '<div class="card modal-in"><h2>Reschedule</h2><label>New date <input type="date" id="rsDate"></label><div id="rsSlots" class="slots"></div>' +
      '<div class="row"><button class="btn" id="rsClose">Close</button></div></div>';
    document.body.appendChild(d);
    d.querySelector('#rsClose').addEventListener('click', function () { d.remove(); });
    d.querySelector('#rsDate').addEventListener('change', function (e) {
      var date = e.target.value;
      api('GET', '/api/admin/slots?doctor_id=' + doctorId + '&date=' + date).then(function (r) {
        var html = '';
        (r.sessions || []).forEach(function (s) {
          s.slots.filter(function (x) { return x.state === 'available'; }).forEach(function (x) {
            html += '<button class="slot" data-rs="' + x.time + '">' + t12(x.time) + '</button>';
          });
        });
        d.querySelector('#rsSlots').innerHTML = html || '<p class="muted">No free slots that day.</p>';
      });
    });
    d.querySelector('#rsSlots').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rs]'); if (!b) return;
      api('POST', '/api/admin/appointments/' + id + '/reschedule', { appointment_date: d.querySelector('#rsDate').value, appointment_time: b.getAttribute('data-rs') }).then(function (r) {
        toast(r.success ? 'Rescheduled' : (r.message || 'Failed'), r.success);
        if (r.success) { d.remove(); summary(); loadList(); }
      });
    });
  }

  // ---------- slots ----------
  function renderSlots() {
    var p = document.getElementById('panel');
    var today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    p.innerHTML = '<form class="filters card" id="sf"><select name="doctor_id">' + doctorOptions(S.doctors[0] && S.doctors[0].id) + '</select><input type="date" name="date" value="' + today + '"></form><div id="sres"></div>';
    var f = document.getElementById('sf');
    var load = function () {
      api('GET', '/api/admin/slots?doctor_id=' + f.doctor_id.value + '&date=' + f.date.value).then(function (r) {
        var html = '<div class="card">';
        if (!r.working) html += '<p class="alert">Doctor does not consult on this day.</p>';
        if (r.on_leave) html += '<p class="alert">Doctor on leave.</p>';
        (r.sessions || []).forEach(function (s) {
          html += '<h3>' + esc(s.session) + ' ' + t12(s.start_time) + '–' + t12(s.end_time) + ' · ' + s.available_count + ' free</h3><div class="slots">' +
            s.slots.map(function (x) { return '<span class="slot ' + (x.state === 'available' ? '' : 'taken') + '" title="' + x.state + '">' + t12(x.time) + ' <small>' + x.state + '</small></span>'; }).join('') + '</div>';
        });
        document.getElementById('sres').innerHTML = html + '</div>';
      });
    };
    f.addEventListener('change', load); load();
  }

  // ---------- leave ----------
  function renderLeave() {
    var p = document.getElementById('panel');
    p.innerHTML = '<form class="card form" id="lf"><h2>Mark doctor leave</h2>' +
      '<label><span>Doctor</span><select name="doctor_id">' + doctorOptions() + '</select></label>' +
      '<label><span>Date</span><input type="date" name="leave_date" required></label>' +
      '<label><span>Session</span><select name="session"><option value="full">Full day</option><option value="morning">Morning only</option><option value="evening">Evening only</option></select></label>' +
      '<label><span>Reason (internal)</span><input name="reason" maxlength="200"></label>' +
      '<p class="muted small">Existing appointments become “leave affected”, each gets the next real free slot as a suggestion, and staff/patients are notified on WhatsApp.</p>' +
      '<button class="btn btn-primary">Mark leave</button></form><div id="lres"></div><h2>Leave list</h2><div id="llist"></div>';
    document.getElementById('lf').addEventListener('submit', function (e) {
      e.preventDefault(); var b = {}; new FormData(e.target).forEach(function (v, k) { b[k] = v; });
      if (!window.confirm('Mark leave? Affected patients will be notified.')) return;
      api('POST', '/api/admin/leaves', b).then(function (r) {
        if (!r.success) return toast(r.message || 'Failed', false);
        document.getElementById('lres').innerHTML = '<div class="card alert-ok"><b>Leave saved.</b> Affected appointments: ' + r.affected.length +
          (r.affected.length ? '<ul>' + r.affected.map(function (a) { return '<li>' + esc(a.appointment_no) + ' → ' + esc(a.suggestion ? a.suggestion.display : 'no free slot found') + '</li>'; }).join('') + '</ul>' : '') + '</div>';
        summary(); loadLeaves();
      });
    });
    loadLeaves();
  }
  function loadLeaves() {
    api('GET', '/api/admin/leaves').then(function (r) {
      var rows = r.leaves || [];
      document.getElementById('llist').innerHTML = rows.length ? '<table class="adm-table"><tr><th>Date</th><th>Doctor</th><th>Session</th><th>Reason</th><th></th></tr>' +
        rows.map(function (l) { return '<tr><td>' + esc(l.leave_date) + '</td><td>' + esc(l.doctor_name) + '</td><td>' + esc(l.session) + '</td><td>' + esc(l.reason) + '</td><td><button data-delleave="' + l.id + '">Remove</button></td></tr>'; }).join('') + '</table>' : '<p class="muted">No leave recorded.</p>';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-delleave]'); if (!b) return;
    if (window.confirm('Remove this leave? (Affected appointments stay flagged for staff.)')) api('DELETE', '/api/admin/leaves/' + b.getAttribute('data-delleave')).then(loadLeaves);
  });

  // ---------- notifications / voice / requests ----------
  function renderNotifications() {
    api('GET', '/api/admin/notifications').then(function (r) {
      var rows = r.notifications || [];
      document.getElementById('panel').innerHTML = '<p class="muted">Statuses: <b>sent</b> = accepted by WhatsApp API · <b>not_configured</b> = credentials missing · <b>failed</b> = API error · <b>dry_run</b> = test mode.</p>' +
        (rows.length ? '<div class="table-wrap"><table class="adm-table"><tr><th>When</th><th>Event</th><th>To</th><th>Appt</th><th>Status</th><th>Error</th><th></th></tr>' +
          rows.map(function (n) { return '<tr><td>' + esc(n.created_at) + '</td><td>' + esc(n.event_type) + '</td><td>' + esc(n.audience) + ' ' + esc(n.recipient) + '</td><td>' + esc(n.appointment_no || '') + '</td><td><span class="badge ' + (n.status === 'sent' ? 'confirmed' : 'cancelled') + '">' + esc(n.status) + '</span></td><td><small>' + esc(n.error || '') + '</small></td><td>' + (n.status !== 'sent' ? '<button data-retry="' + n.id + '">Retry</button>' : '') + '</td></tr>'; }).join('') + '</table></div>' : '<p class="card muted">No notifications yet.</p>');
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-retry]'); if (!b) return;
    api('POST', '/api/admin/notifications/' + b.getAttribute('data-retry') + '/retry').then(function (r) { toast('Status: ' + r.status, r.status === 'sent'); renderNotifications(); summary(); });
  });

  function renderVoice() {
    api('GET', '/api/admin/voice-calls').then(function (r) {
      var rows = r.calls || [];
      document.getElementById('panel').innerHTML = '<p class="muted">AI voice bookings are in Appointments → “AI voice bookings”. Below: post-call logs sent by OmniDimension.</p>' +
        (rows.length ? '<div class="table-wrap"><table class="adm-table"><tr><th>When</th><th>Caller</th><th>Lang</th><th>Outcome</th><th>Appt</th><th>Summary</th></tr>' +
          rows.map(function (c) { return '<tr><td>' + esc(c.created_at) + '</td><td>' + esc(c.caller_mobile) + '</td><td>' + esc(c.language) + '</td><td>' + esc(c.outcome) + '</td><td>' + esc(c.appointment_no) + '</td><td><small>' + esc(c.summary) + '</small></td></tr>'; }).join('') + '</table></div>' : '<p class="card muted">No call logs received yet.</p>');
    });
  }
  function renderRequests() {
    api('GET', '/api/admin/staff-requests').then(function (r) {
      var rows = r.requests || [];
      document.getElementById('panel').innerHTML = rows.length ? '<div class="table-wrap"><table class="adm-table"><tr><th>When</th><th>Patient</th><th>Mobile</th><th>Reason</th><th>Status</th><th></th></tr>' +
        rows.map(function (q) { return '<tr><td>' + esc(q.created_at) + '</td><td>' + esc(q.patient_name) + '</td><td>' + esc(q.mobile) + '</td><td>' + esc(q.reason) + '</td><td>' + esc(q.status) + '</td><td>' + (q.status === 'open' ? '<button data-resolve="' + q.id + '">Mark resolved</button>' : '') + '</td></tr>'; }).join('') + '</table></div>' : '<p class="card muted">No staff requests.</p>';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-resolve]'); if (!b) return;
    api('POST', '/api/admin/staff-requests/' + b.getAttribute('data-resolve') + '/resolve').then(function () { renderRequests(); summary(); });
  });

  function boot() {
    api('GET', '/api/admin/doctors').then(function (r) {
      if (!r.success) return;
      S.doctors = r.doctors; shell(); render();
    }).catch(function () { /* login shown */ });
  }
  boot();
})();
