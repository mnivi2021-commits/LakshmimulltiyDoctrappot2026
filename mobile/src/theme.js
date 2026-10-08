import { StyleSheet } from 'react-native';

export const C = {
  brand: '#0b6e78', brandL: '#e6f4f5', accent: '#f0a830', ai: '#4b3fb5', wa: '#1f9d55',
  ink: '#1b2a33', muted: '#5d6b75', line: '#dde5ea', bg: '#f6f9fa', ok: '#1f8a4c', danger: '#c0392b',
};

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '700', color: C.ink, marginBottom: 8 },
  h2: { fontSize: 19, fontWeight: '700', color: C.ink, marginVertical: 10 },
  p: { fontSize: 16, color: C.ink, lineHeight: 23 },
  muted: { fontSize: 15, color: C.muted },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 },
  bigBtn: { minHeight: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 12 },
  bigBtnText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  chip: { borderWidth: 1.5, borderColor: C.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginRight: 8, marginBottom: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.brand },
  chipText: { color: C.brand, fontWeight: '600', fontSize: 15 },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  label: { fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#c5d2da', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#fff', minHeight: 50, color: C.ink },
  alert: { backgroundColor: '#fff6e5', borderColor: '#f3d29a', borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 8 },
  err: { backgroundColor: '#fdecea', borderColor: '#f5c6c0', borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 8 },
  kvRow: { flexDirection: 'row', paddingVertical: 4 },
  kvK: { width: 130, color: C.muted, fontSize: 15 },
  kvV: { flex: 1, fontWeight: '700', fontSize: 15, color: C.ink },
});
