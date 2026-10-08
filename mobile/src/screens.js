import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { api, CALL_URL, WHATSAPP_URL, addDays, prettyDate, time12 } from './api';
import { useT } from './i18n';
import { C, s } from './theme';

function BigButton({ label, color, textColor = '#fff', onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.bigBtn, { backgroundColor: color, opacity: pressed ? 0.85 : 1 }]}>
      <Text style={[s.bigBtnText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, on, disabled, onPress }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityState={{ selected: on, disabled }}
      style={[s.chip, on && s.chipOn, disabled && { borderColor: C.line, backgroundColor: '#f1f4f6' }]}>
      <Text style={[s.chipText, on && s.chipTextOn, disabled && { color: '#9aa7b0', textDecorationLine: 'line-through' }]}>{label}</Text>
    </Pressable>
  );
}

function ApptCard({ a, title }) {
  const t = useT();
  const rows = [[t('appt_no'), a.appointment_no], [t('doctor'), a.doctor], [t('dept'), a.department], [t('date'), prettyDate(a.appointment_date)],
    [t('time'), time12(a.appointment_time)], [t('patient'), a.patient_name], [t('status_l'), a.status]];
  return (
    <View style={[s.card, { borderColor: C.ok, borderWidth: 2 }]}>
      <Text style={[s.h2, { color: C.ok, marginTop: 0 }]}>✅ {title || t('confirmed')}</Text>
      <Text style={s.muted}>{t('hospital')}</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={s.kvRow}><Text style={s.kvK}>{k}</Text><Text style={[s.kvV, k === t('appt_no') && { fontSize: 22, color: C.brand }]}>{v}</Text></View>
      ))}
    </View>
  );
}

const openCall = () => Linking.openURL(CALL_URL);
const openWhatsApp = () => Linking.openURL(WHATSAPP_URL);

// ---------------- Home ----------------
export function HomeScreen({ go }) {
  const t = useT();
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <View style={[s.card, { backgroundColor: C.brand, borderColor: C.brand }]}>
        <Text style={[s.h1, { color: '#fff' }]}>{t('hospital')}</Text>
        <Text style={{ color: '#e6f4f5', fontSize: 16 }}>{t('welcome')}</Text>
      </View>
      <BigButton label={`📅  ${t('btn_book')}`} color={C.accent} textColor="#2b1d00" onPress={() => go('book')} />
      <BigButton label={`📞  ${t('btn_ai')}`} color={C.ai} onPress={openCall} />
      <BigButton label={`💬  ${t('btn_wa')}`} color={C.wa} onPress={openWhatsApp} />
      <BigButton label={`🤖  ${t('btn_chat')}`} color="#fff" textColor={C.ai} onPress={() => go('chat')} />
      <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>தமிழ் · English · हिंदी</Text>
      <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{t('emergency')}</Text>
    </ScrollView>
  );
}

// ---------------- Doctors ----------------
export function DoctorsScreen({ go, doctors, lang }) {
  const t = useT();
  return (
    <ScrollView contentContainerStyle={s.pad}>
      {doctors.map((d) => (
        <View key={d.id} style={s.card}>
          <Text style={{ color: C.brand, fontWeight: '800', textTransform: 'uppercase' }}>{(d.label && d.label[lang]) || d.department}</Text>
          <Text style={[s.h2, { marginTop: 2, marginBottom: 0 }]}>{d.name}</Text>
          <Text style={s.muted}>{d.qualification}</Text>
          {d.sessions.map((x) => (
            <Text key={x.session} style={[s.p, { marginTop: 4 }]}>{t(x.session)}: <Text style={{ fontWeight: '700' }}>{time12(x.start_time)} – {time12(x.end_time)}</Text></Text>
          ))}
          <Text style={[s.muted, { marginTop: 4 }]}>{t('mon_sat')}</Text>
          <View style={{ marginTop: 10 }}><BigButton label={t('btn_book')} color={C.accent} textColor="#2b1d00" onPress={() => go('book', { doctorId: d.id })} /></View>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------- Book ----------------
export function BookScreen({ doctors, meta, lang, params }) {
  const t = useT();
  const [doctorId, setDoctorId] = useState(params && params.doctorId ? params.doctorId : null);
  const [date, setDate] = useState(meta ? meta.today : null);
  const [session, setSession] = useState('morning');
  const [day, setDay] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ patient_name: '', mobile: '', patient_type: 'new', reason: '' });
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (params && params.doctorId) setDoctorId(params.doctorId); }, [params]);
  useEffect(() => { if (meta && !date) setDate(meta.today); }, [meta]);
  useEffect(() => {
    setDay(null); setTime(null);
    if (!doctorId || !date) return;
    api.availability(doctorId, date).then(setDay).catch(() => setMsg(t('net_err')));
  }, [doctorId, date]);

  const dates = meta ? Array.from({ length: 7 }, (_, i) => addDays(meta.today, i)) : [];
  const sess = day && day.sessions ? day.sessions.find((x) => x.session === session) : null;
  const other = day && day.sessions ? day.sessions.find((x) => x.session !== session && x.available_count > 0) : null;
  const next = other ? { date, time: other.slots.find((x) => x.state === 'available').time, session: other.session } : (day && day.next_available && day.next_available[0]);

  async function submit() {
    setMsg(null);
    if (!time) { setMsg(t('pick_time')); return; }
    setBusy(true);
    try {
      const r = await api.book({ doctor: String(doctorId), appointment_date: date, appointment_time: time, session, language: lang, ...form });
      if (r.success) { setDone(r.appointment); return; }
      if (r.errors) setMsg(`${t('fix')}\n• ${Object.values(r.errors).join('\n• ')}`);
      else setMsg(`${r.message || ''}${r.alternatives && r.alternatives.length ? `\n${t('next_avail')} ${r.alternatives.map((a) => `${prettyDate(a.date)} ${time12(a.time)}`).join(', ')}` : ''}`);
      if (r.code !== 'validation') api.availability(doctorId, date).then(setDay);
    } catch { setMsg(t('net_err')); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <ScrollView contentContainerStyle={s.pad}>
        <ApptCard a={done} />
        <Text style={s.muted}>{t('keep_no')}</Text>
        <View style={{ marginTop: 16 }}><BigButton label={t('book_again')} color={C.brand} onPress={() => { setDone(null); setTime(null); setForm({ patient_name: '', mobile: '', patient_type: 'new', reason: '' }); api.availability(doctorId, date).then(setDay); }} /></View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.muted}>{t('only_real')}</Text>
      <Text style={s.label}>{t('choose_doctor')}</Text>
      <View style={s.row}>{doctors.map((d) => <Chip key={d.id} label={`${d.name} – ${(d.label && d.label[lang]) || d.department}`} on={doctorId === d.id} onPress={() => setDoctorId(d.id)} />)}</View>
      <Text style={s.label}>{t('choose_date')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{dates.map((d) => <Chip key={d} label={prettyDate(d)} on={date === d} onPress={() => setDate(d)} />)}</ScrollView>
      <View style={[s.row, { marginTop: 8 }]}>
        <Chip label={`🌅 ${t('morning')}`} on={session === 'morning'} onPress={() => { setSession('morning'); setTime(null); }} />
        <Chip label={`🌇 ${t('evening')}`} on={session === 'evening'} onPress={() => { setSession('evening'); setTime(null); }} />
      </View>
      <Text style={s.label}>{t('choose_time')}</Text>
      {!doctorId ? null : !day ? <ActivityIndicator color={C.brand} /> : sess && sess.available_count > 0 ? (
        <View style={s.row}>{sess.slots.map((x) => <Chip key={x.time} label={time12(x.time)} on={time === x.time} disabled={x.state !== 'available'} onPress={() => setTime(x.time)} />)}</View>
      ) : (
        <View style={s.alert}>
          <Text style={s.p}>{day.reason_text || t('no_free')}</Text>
          {next ? (
            <View style={{ marginTop: 8 }}>
              <Text style={s.p}>{t('next_avail')} <Text style={{ fontWeight: '700' }}>{prettyDate(next.date)}, {time12(next.time)}</Text></Text>
              <View style={{ marginTop: 8 }}><Chip label={t('book_this')} on onPress={() => { setSession(next.session); if (next.date !== date) setDate(next.date); setTimeout(() => setTime(next.time), next.date !== date ? 800 : 0); }} /></View>
            </View>
          ) : null}
        </View>
      )}
      <Text style={s.label}>{t('name')}</Text>
      <TextInput style={s.input} value={form.patient_name} onChangeText={(v) => setForm({ ...form, patient_name: v })} autoComplete="name" maxLength={80} />
      <Text style={s.label}>{t('mobile')}</Text>
      <TextInput style={s.input} value={form.mobile} onChangeText={(v) => setForm({ ...form, mobile: v })} keyboardType="phone-pad" maxLength={14} />
      <View style={[s.row, { marginTop: 12 }]}>
        <Chip label={t('new_p')} on={form.patient_type === 'new'} onPress={() => setForm({ ...form, patient_type: 'new' })} />
        <Chip label={t('existing_p')} on={form.patient_type === 'existing'} onPress={() => setForm({ ...form, patient_type: 'existing' })} />
      </View>
      <Text style={s.label}>{t('reason')}</Text>
      <TextInput style={[s.input, { minHeight: 70 }]} value={form.reason} onChangeText={(v) => setForm({ ...form, reason: v })} multiline maxLength={300} />
      {msg ? <View style={s.err}><Text style={s.p}>{msg}</Text></View> : null}
      <View style={{ marginTop: 16 }}><BigButton label={busy ? t('loading') : t('confirm')} color={C.accent} textColor="#2b1d00" onPress={busy ? undefined : submit} /></View>
    </ScrollView>
  );
}

// ---------------- Chat (same /api/chat engine as the website) ----------------
export function ChatScreen({ lang, setLang }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [buttons, setButtons] = useState([]);
  const [links, setLinks] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [kb, setKb] = useState('default');
  const state = useRef(null);
  const scroller = useRef(null);

  async function send(payload, echo) {
    if (echo) setItems((x) => [...x, { me: true, text: echo }]);
    setBusy(true);
    try {
      const r = await api.chat({ ...payload, state: state.current, lang: payload.message ? undefined : lang });
      if (!r.messages) throw new Error('bad');
      state.current = r.state;
      if (r.lang && r.lang !== lang) setLang(r.lang);
      setItems((x) => [...x, ...r.messages]);
      setButtons(r.buttons || []); setLinks(r.links || []);
      setKb(r.input === 'tel' ? 'phone-pad' : 'default');
    } catch { setItems((x) => [...x, { type: 'text', text: t('net_err') }]); } finally { setBusy(false); }
  }
  useEffect(() => { send({ action: 'menu' }); }, []);
  useEffect(() => { setTimeout(() => scroller.current && scroller.current.scrollToEnd({ animated: true }), 50); }, [items]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.row, { padding: 8, backgroundColor: '#f3f2fb', justifyContent: 'center' }]}>
        {[['ta', 'தமிழ்'], ['en', 'English'], ['hi', 'हिंदी']].map(([k, l]) => (
          <Chip key={k} label={l} on={lang === k} onPress={() => { setLang(k); state.current = null; setItems([]); setTimeout(() => send({ action: 'menu' }), 0); }} />
        ))}
      </View>
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {items.map((m, i) => m.type === 'card' ? (
          <View key={i} style={[s.card, { marginBottom: 8 }]}>
            <Text style={{ fontWeight: '800', color: C.ok, marginBottom: 4 }}>{m.title}</Text>
            {m.rows.map(([k, v]) => <View key={k} style={s.kvRow}><Text style={[s.kvK, { width: 110 }]}>{k}</Text><Text style={s.kvV}>{v}</Text></View>)}
          </View>
        ) : (
          <View key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: m.me ? C.ai : '#fff', borderRadius: 14, padding: 10, marginBottom: 8, borderWidth: m.me ? 0 : 1, borderColor: C.line }}>
            <Text style={{ color: m.me ? '#fff' : C.ink, fontSize: 16 }}>{m.text}</Text>
          </View>
        ))}
        {busy ? <ActivityIndicator color={C.ai} style={{ alignSelf: 'flex-start', margin: 8 }} /> : null}
      </ScrollView>
      <ScrollView style={{ maxHeight: 210, borderTopWidth: 1, borderColor: C.line, backgroundColor: '#fff' }} contentContainerStyle={[s.row, { padding: 8 }]}>
        {buttons.map((b) => (
          <Pressable key={b.value + b.label} onPress={() => !busy && send({ action: b.value }, b.label)} style={[s.chip, { borderColor: C.ai, borderRadius: 999 }]}>
            <Text style={[s.chipText, { color: C.ai }]}>{b.label}</Text>
          </Pressable>
        ))}
        {links.map((l) => (
          <Pressable key={l.href} onPress={() => (l.href === '/call' ? openCall() : Linking.openURL(l.href))} style={[s.chip, { backgroundColor: C.ai, borderColor: C.ai, borderRadius: 999 }]}>
            <Text style={[s.chipText, { color: '#fff' }]}>{l.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderColor: C.line }}>
        <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} value={text} onChangeText={setText} placeholder={t('type_msg')} keyboardType={kb}
          onSubmitEditing={() => { if (text.trim() && !busy) { send({ message: text.trim() }, text.trim()); setText(''); } }} returnKeyType="send" />
        <Pressable onPress={() => { if (text.trim() && !busy) { send({ message: text.trim() }, text.trim()); setText(''); } }} style={{ backgroundColor: C.ai, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{t('send')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------- Status ----------------
export function StatusScreen() {
  const t = useT();
  const [no, setNo] = useState('');
  const [mobile, setMobile] = useState('');
  const [a, setA] = useState(null);
  const [msg, setMsg] = useState(null);

  async function check() {
    setMsg(null); setA(null);
    try {
      const r = await api.status(no, mobile);
      if (r.success) setA(r.appointment); else setMsg(r.message);
    } catch { setMsg(t('net_err')); }
  }
  function cancel() {
    Alert.alert(t('cancel_appt'), t('cancel_q'), [
      { text: t('no'), style: 'cancel' },
      { text: t('yes'), style: 'destructive', onPress: async () => {
        const r = await api.cancel(no, mobile);
        if (r.success) setA(r.appointment); else setMsg(r.message);
      } },
    ]);
  }
  const active = a && ['booked', 'confirmed', 'leave_affected'].includes(a.status);
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.label}>{t('appt_no')}</Text>
      <TextInput style={s.input} value={no} onChangeText={setNo} placeholder="LMH-0001" autoCapitalize="characters" maxLength={12} />
      <Text style={s.label}>{t('mobile')}</Text>
      <TextInput style={s.input} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" maxLength={14} />
      <View style={{ marginTop: 16 }}><BigButton label={t('check')} color={C.brand} onPress={check} /></View>
      {msg ? <View style={s.err}><Text style={s.p}>{msg}</Text></View> : null}
      {a ? <ApptCard a={a} title={a.appointment_no} /> : null}
      {a && a.suggested ? <View style={s.alert}><Text style={s.p}>{t('next_avail')} {a.suggested}</Text></View> : null}
      {active ? <BigButton label={t('cancel_appt')} color="#fff" textColor={C.danger} onPress={cancel} /> : null}
    </ScrollView>
  );
}
