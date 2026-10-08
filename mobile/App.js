import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api } from './src/api';
import { LangContext, useT } from './src/i18n';
import { C } from './src/theme';
import { BookScreen, ChatScreen, DoctorsScreen, HomeScreen, StatusScreen } from './src/screens';

const TABS = [['home', '🏠'], ['doctors', '👨‍⚕️'], ['book', '📅'], ['chat', '🤖'], ['status', '📋']];

export default function App() {
  const [lang, setLang] = useState('en');
  const [tab, setTab] = useState('home');
  const [params, setParams] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.doctors(), api.meta()])
      .then(([d, m]) => { setDoctors(d.doctors || []); setMeta(m); })
      .catch(() => setError('Cannot reach the hospital server. Check EXPO_PUBLIC_API_URL and your internet connection.'));
  }, []);

  const go = (name, p = null) => { setParams(p); setTab(name); };

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <StatusBar style="dark" />
          <Header lang={lang} setLang={setLang} />
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {error ? <Text style={{ padding: 16, color: C.danger, fontSize: 16 }}>{error}</Text> : null}
            {tab === 'home' && <HomeScreen go={go} />}
            {tab === 'doctors' && <DoctorsScreen go={go} doctors={doctors} lang={lang} />}
            {tab === 'book' && <BookScreen doctors={doctors} meta={meta} lang={lang} params={params} />}
            {tab === 'chat' && <ChatScreen lang={lang} setLang={setLang} />}
            {tab === 'status' && <StatusScreen />}
          </KeyboardAvoidingView>
          <TabBar tab={tab} go={go} />
        </SafeAreaView>
      </SafeAreaProvider>
    </LangContext.Provider>
  );
}

function Header({ lang, setLang }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderColor: C.line, backgroundColor: '#fff' }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>+</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink }} numberOfLines={1}>{t('hospital')}</Text>
        <Text style={{ fontSize: 12, color: C.muted }}>{t('city')}</Text>
      </View>
      {[['ta', 'த'], ['en', 'En'], ['hi', 'हि']].map(([k, l]) => (
        <Pressable key={k} onPress={() => setLang(k)} accessibilityLabel={k}
          style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginLeft: 4, backgroundColor: lang === k ? C.brand : '#fff', borderWidth: 1, borderColor: C.line }}>
          <Text style={{ color: lang === k ? '#fff' : C.ink, fontWeight: '700' }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TabBar({ tab, go }) {
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: '#fff' }}>
      {TABS.map(([k, icon]) => (
        <Pressable key={k} onPress={() => go(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8, minHeight: 58 }}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tab === k ? C.brand : C.muted }}>{t(k)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
