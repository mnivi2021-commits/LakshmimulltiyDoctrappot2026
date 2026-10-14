/* Page translations. English comes from the HTML itself; Tamil and Hindi here. */
(function () {
  'use strict';
  var D = {
    ta: {
      hospital_name: 'லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனை', hospital_city: 'விருதுநகர், தமிழ்நாடு', menu: 'மெனு',
      nav_home: 'முகப்பு', nav_doctors: 'மருத்துவர்கள்', nav_schedule: 'மருத்துவர் நேர அட்டவணை', nav_book: 'சந்திப்பு முன்பதிவு',
      nav_ai: 'AI குரல் வரவேற்பாளர்', nav_status: 'சந்திப்பு நிலை', nav_contact: 'தொடர்பு',
      footer_note: 'அவசர நிலையில் அருகிலுள்ள அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும் அல்லது 108 ஐ அழைக்கவும்.',
      btn_book_short: 'முன்பதிவு', btn_ai_short: 'AI அழைப்பு', chat_fab: '🤖 AI வரவேற்பாளர்',
      btn_book: 'சந்திப்பு முன்பதிவு', btn_ai: 'AI வரவேற்பாளருடன் பேச', btn_ai_call: 'AI அழைப்பு', btn_chat: 'அரட்டைப் பெட்டி', btn_chat_short: 'அரட்டை',
      dept_vijul: 'எலும்பு மருத்துவம்', dept_vishwa: 'சர்க்கரை நோய் நிபுணர்', dept_nivi: 'இதய நிபுணர்',
      morning: 'காலை', evening: 'மாலை', mon_sat: 'திங்கள் – சனி', btn_book_with: 'சந்திப்பு முன்பதிவு',
      hero_eyebrow: 'விருதுநகரின் நம்பகமான பல்துறை மருத்துவம்', hero_title: 'ஒரு நிமிடத்தில் மருத்துவர் சந்திப்பை முன்பதிவு செய்யுங்கள்',
      hero_lead: 'ஆன்லைனில், AI தொலைபேசி வரவேற்பாளர் அல்லது AI சாட் மூலம் — தமிழ், ஆங்கிலம் அல்லது இந்தியில். ஒவ்வொரு சந்திப்பும் மருத்துவரின் உண்மையான அட்டவணையுடன் சரிபார்க்கப்படுகிறது.',
      our_doctors: 'எங்கள் மருத்துவர்கள்', how_title: 'முன்பதிவு எப்படி',
      how1_t: 'மருத்துவர் & தேதியைத் தேர்வு செய்யுங்கள்', how1: 'உண்மையில் காலியாக உள்ள நேரங்கள் மட்டுமே காட்டப்படும்.',
      how2_t: 'நோயாளி விவரங்களை உள்ளிடுங்கள்', how2: 'பெயர், மொபைல் எண் மற்றும் வருகைக் காரணம்.',
      how3_t: 'சந்திப்பு எண்ணைப் பெறுங்கள்', how3: 'உதா: LMH-0001. சரிபார்க்க அல்லது மாற்ற இதை வைத்திருங்கள்.',
      doctor: 'மருத்துவர் / பிரிவு', sched_note: 'திங்கள் முதல் சனி வரை. ஞாயிறு விடுமுறை. மருத்துவர் விடுப்பு கீழே நேரலையாகப் புதுப்பிக்கப்படும்.',
      live_title: 'நேரலை கிடைக்கும் நேரங்கள்', date: 'சந்திப்பு தேதி',
      book_intro: 'உண்மையான காலி நேரங்கள் மட்டுமே காட்டப்படும். மருத்துவமனை அமைப்பு சேமித்த பிறகே சந்திப்பு எண் வழங்கப்படும்.',
      choose_doctor: 'மருத்துவரைத் தேர்வு செய்யவும்', session: 'காலை / மாலை', pref_time: 'விரும்பும் நேரம்',
      pick_first: 'காலி நேரங்களைப் பார்க்க மருத்துவர் மற்றும் தேதியைத் தேர்வு செய்யவும்.',
      patient_name: 'நோயாளியின் பெயர்', mobile: 'மொபைல் எண்', patient_type: 'புதிய / பழைய நோயாளி',
      new_patient: 'புதிய நோயாளி', existing_patient: 'பழைய நோயாளி', reason: 'வருகைக்கான காரணம்', confirm_booking: 'சந்திப்பை உறுதி செய்',
      ai_lead: 'சந்திப்பை முன்பதிவு செய்ய, சரிபார்க்க, மாற்ற அல்லது ரத்து செய்ய எங்கள் AI வரவேற்பாளரை எப்போது வேண்டுமானாலும் அழைக்கவும்.',
      call_unavailable: 'AI தொலைபேசி இப்போது கிடைக்கவில்லை. ஆன்லைன் முன்பதிவு அல்லது AI சாட்டைப் பயன்படுத்தவும்.',
      tap_call: 'அழைக்க தொலைபேசியைத் தொடவும்', ai_how: 'AI வரவேற்பாளர் என்ன செய்யும்',
      ai1: 'வரவேற்கிறது: “லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனைக்கு வரவேற்கிறோம். உங்களுக்கு எப்படி உதவலாம்?”',
      ai2: 'எந்த மருத்துவர், தேதி, காலை/மாலை, நேரம் என்று கேட்கும்.', ai3: 'உறுதி செய்வதற்கு முன் உண்மையான சந்திப்புப் பதிவேட்டைச் சரிபார்க்கும் — ஊகிக்காது.',
      ai4: 'உங்கள் நேரம் நிரம்பியிருந்தால், அடுத்த உண்மையான காலி நேரத்தை வழங்கும்.', ai5: 'LMH-0001 போன்ற சந்திப்பு எண்ணை வழங்கும்.',
      chat_instead: 'தட்டச்சு செய்ய விருப்பமா? AI சாட்டைத் திறக்கவும்', appt_no: 'சந்திப்பு எண்', check_status: 'நிலையைச் சரிபார்',
      resched_hint: 'நேரம் மாற்ற AI சாட் அல்லது AI வரவேற்பாளரைப் பயன்படுத்தவும்.',
      wa_unavailable: 'WhatsApp சாட் இப்போது கிடைக்கவில்லை. ஆன்லைனில் முன்பதிவு செய்யவும் அல்லது AI வரவேற்பாளரைப் பயன்படுத்தவும்.',
      open_maps: 'Google Maps இல் திறக்க', not_found: 'பக்கம் கிடைக்கவில்லை.',
      js_loading: 'சரிபார்க்கிறது…', js_no_free: 'இந்த அமர்வில் காலி நேரம் இல்லை.', js_pick_time: 'ஒரு நேரத்தைத் தேர்வு செய்யவும்.',
      js_next_avail: 'முதலில் கிடைக்கும் நேரம்:', js_book_this: 'இதை முன்பதிவு செய்', js_confirmed: 'சந்திப்பு உறுதி செய்யப்பட்டது',
      js_appt_no: 'சந்திப்பு எண்', js_doctor: 'மருத்துவர்', js_dept: 'பிரிவு', js_date: 'தேதி', js_time: 'நேரம்', js_patient: 'நோயாளி', js_status: 'நிலை',
      js_keep_no: 'இந்த எண்ணைச் சேமித்து வைக்கவும். 10 நிமிடங்கள் முன்னதாக வரவும்.', js_net_error: 'இணைப்பு பிழை. எதுவும் முன்பதிவு செய்யப்படவில்லை. மீண்டும் முயற்சிக்கவும்.',
      js_fix_errors: 'தயவுசெய்து சரிசெய்யவும்:', js_cancel_appt: 'சந்திப்பை ரத்து செய்', js_cancel_confirm: 'இந்த சந்திப்பை ரத்து செய்யவா?', js_cancelled: 'சந்திப்பு ரத்து செய்யப்பட்டது.',
      js_available: 'காலி', js_unavailable_try: 'இந்த நேரம் கிடைக்கவில்லை. அடுத்த உண்மையான காலி நேரங்கள்:', js_free_count: 'காலி நேரங்கள்',
      st_booked: 'முன்பதிவு', st_confirmed: 'உறுதி', st_cancelled: 'ரத்து', st_completed: 'முடிந்தது', st_leave_affected: 'மருத்துவர் இல்லை – ஊழியர்கள் அழைப்பார்கள்',
      chat_title: 'AI வரவேற்பாளர்', chat_online: 'ஆன்லைன்', chat_placeholder: 'உங்கள் செய்தியை எழுதவும்…', chat_send: 'அனுப்பு', chat_close: 'மூடு',
      chat_book: '📅 முன்பதிவு', chat_call: '📞 AI அழைப்பு', chat_restart: '↺ மீண்டும்',
    },
    hi: {
      hospital_name: 'लक्ष्मी मल्टीस्पेशलिटी हॉस्पिटल', hospital_city: 'विरुधुनगर, तमिलनाडु', menu: 'मेनू',
      nav_home: 'होम', nav_doctors: 'डॉक्टर', nav_schedule: 'डॉक्टर का समय', nav_book: 'अपॉइंटमेंट बुक करें',
      nav_ai: 'AI वॉइस रिसेप्शनिस्ट', nav_status: 'अपॉइंटमेंट स्थिति', nav_contact: 'संपर्क',
      footer_note: 'आपातकाल में नज़दीकी इमरजेंसी विभाग जाएँ या 108 पर कॉल करें।',
      btn_book_short: 'बुक करें', btn_ai_short: 'AI कॉल', chat_fab: '🤖 AI रिसेप्शनिस्ट',
      btn_book: 'अपॉइंटमेंट बुक करें', btn_ai: 'AI रिसेप्शनिस्ट से बात करें', btn_ai_call: 'AI कॉल', btn_chat: 'चैट बॉक्स', btn_chat_short: 'चैट',
      dept_vijul: 'हड्डी रोग', dept_vishwa: 'मधुमेह विशेषज्ञ', dept_nivi: 'हृदय रोग विशेषज्ञ',
      morning: 'सुबह', evening: 'शाम', mon_sat: 'सोमवार – शनिवार', btn_book_with: 'अपॉइंटमेंट बुक करें',
      hero_eyebrow: 'विरुधुनगर का भरोसेमंद मल्टीस्पेशलिटी अस्पताल', hero_title: 'एक मिनट में डॉक्टर अपॉइंटमेंट बुक करें',
      hero_lead: 'ऑनलाइन, AI फ़ोन रिसेप्शनिस्ट या AI चैट से — तमिल, अंग्रेज़ी या हिंदी में। हर अपॉइंटमेंट डॉक्टर के असली शेड्यूल से जाँचा जाता है।',
      our_doctors: 'हमारे डॉक्टर', how_title: 'बुकिंग कैसे करें',
      how1_t: 'डॉक्टर और तारीख चुनें', how1: 'सिर्फ़ वही समय दिखते हैं जो सच में खाली हैं।',
      how2_t: 'मरीज़ की जानकारी भरें', how2: 'नाम, मोबाइल नंबर और आने का कारण।',
      how3_t: 'अपॉइंटमेंट नंबर पाएँ', how3: 'उदाहरण: LMH-0001. जाँचने या बदलने के लिए इसे संभालकर रखें।',
      doctor: 'डॉक्टर / विभाग', sched_note: 'सोमवार से शनिवार। रविवार अवकाश। डॉक्टर की छुट्टी नीचे लाइव अपडेट होती है।',
      live_title: 'लाइव उपलब्धता', date: 'अपॉइंटमेंट की तारीख',
      book_intro: 'सिर्फ़ असली खाली समय दिखाए जाते हैं। अस्पताल सिस्टम में सेव होने के बाद ही अपॉइंटमेंट नंबर मिलता है।',
      choose_doctor: 'डॉक्टर चुनें', session: 'सुबह / शाम', pref_time: 'पसंदीदा समय',
      pick_first: 'खाली समय देखने के लिए डॉक्टर और तारीख चुनें।',
      patient_name: 'मरीज़ का नाम', mobile: 'मोबाइल नंबर', patient_type: 'नया या पुराना मरीज़',
      new_patient: 'नया मरीज़', existing_patient: 'पुराना मरीज़', reason: 'आने का कारण', confirm_booking: 'अपॉइंटमेंट कन्फ़र्म करें',
      ai_lead: 'अपॉइंटमेंट बुक करने, देखने, बदलने या रद्द करने के लिए कभी भी हमारे AI रिसेप्शनिस्ट को कॉल करें।',
      call_unavailable: 'AI फ़ोन लाइन अभी उपलब्ध नहीं है। कृपया ऑनलाइन बुकिंग या AI चैट का उपयोग करें।',
      tap_call: 'कॉल करने के लिए फ़ोन दबाएँ', ai_how: 'AI रिसेप्शनिस्ट क्या करता है',
      ai1: 'स्वागत करता है: “लक्ष्मी मल्टीस्पेशलिटी हॉस्पिटल में आपका स्वागत है। मैं आपकी कैसे सहायता कर सकता हूँ?”',
      ai2: 'कौन से डॉक्टर, तारीख, सुबह/शाम और समय — यह पूछता है।', ai3: 'कन्फ़र्म करने से पहले असली अपॉइंटमेंट बुक जाँचता है — अंदाज़ा नहीं लगाता।',
      ai4: 'अगर आपका समय भरा है, तो अगला असली खाली समय बताता है।', ai5: 'LMH-0001 जैसा अपॉइंटमेंट नंबर देता है।',
      chat_instead: 'टाइप करना पसंद है? AI चैट खोलें', appt_no: 'अपॉइंटमेंट नंबर', check_status: 'स्थिति देखें',
      resched_hint: 'समय बदलने के लिए AI चैट या AI रिसेप्शनिस्ट का उपयोग करें।',
      wa_unavailable: 'WhatsApp चैट अभी उपलब्ध नहीं है। कृपया ऑनलाइन बुक करें या AI रिसेप्शनिस्ट का उपयोग करें।',
      open_maps: 'Google Maps में खोलें', not_found: 'पेज नहीं मिला।',
      js_loading: 'जाँच रहे हैं…', js_no_free: 'इस सत्र में कोई खाली समय नहीं है।', js_pick_time: 'कृपया एक समय चुनें।',
      js_next_avail: 'पहला उपलब्ध अपॉइंटमेंट:', js_book_this: 'यह बुक करें', js_confirmed: 'अपॉइंटमेंट कन्फ़र्म हो गया',
      js_appt_no: 'अपॉइंटमेंट नंबर', js_doctor: 'डॉक्टर', js_dept: 'विभाग', js_date: 'तारीख', js_time: 'समय', js_patient: 'मरीज़', js_status: 'स्थिति',
      js_keep_no: 'यह नंबर संभालकर रखें। 10 मिनट पहले पहुँचें।', js_net_error: 'कनेक्शन त्रुटि। कुछ भी बुक नहीं हुआ। फिर से कोशिश करें।',
      js_fix_errors: 'कृपया ठीक करें:', js_cancel_appt: 'अपॉइंटमेंट रद्द करें', js_cancel_confirm: 'क्या यह अपॉइंटमेंट रद्द करें?', js_cancelled: 'अपॉइंटमेंट रद्द कर दिया गया।',
      js_available: 'खाली', js_unavailable_try: 'यह समय उपलब्ध नहीं है। अगले असली खाली समय:', js_free_count: 'खाली समय',
      st_booked: 'बुक', st_confirmed: 'कन्फ़र्म', st_cancelled: 'रद्द', st_completed: 'पूर्ण', st_leave_affected: 'डॉक्टर उपलब्ध नहीं – स्टाफ़ कॉल करेगा',
      chat_title: 'AI रिसेप्शनिस्ट', chat_online: 'ऑनलाइन', chat_placeholder: 'अपना संदेश लिखें…', chat_send: 'भेजें', chat_close: 'बंद करें',
      chat_book: '📅 बुक करें', chat_call: '📞 AI कॉल', chat_restart: '↺ फिर से',
    },
    en: {
      js_loading: 'Checking…', js_no_free: 'No free time in this session.', js_pick_time: 'Please choose a time.',
      js_next_avail: 'First available appointment:', js_book_this: 'Book this', js_confirmed: 'Appointment Confirmed',
      js_appt_no: 'Appointment No', js_doctor: 'Doctor', js_dept: 'Department', js_date: 'Date', js_time: 'Time', js_patient: 'Patient', js_status: 'Status',
      js_keep_no: 'Please keep this number. Arrive 10 minutes early.', js_net_error: 'Connection problem. Nothing was booked. Please try again.',
      js_fix_errors: 'Please correct:', js_cancel_appt: 'Cancel appointment', js_cancel_confirm: 'Cancel this appointment?', js_cancelled: 'Appointment cancelled.',
      js_available: 'free', js_unavailable_try: 'That time is not available. Next real free times:', js_free_count: 'free slots',
      st_booked: 'Booked', st_confirmed: 'Confirmed', st_cancelled: 'Cancelled', st_completed: 'Completed', st_leave_affected: 'Doctor unavailable – staff will call you',
      chat_title: 'AI Receptionist', chat_online: 'Online', chat_placeholder: 'Type your message…', chat_send: 'Send', chat_close: 'Close',
      chat_book: '📅 Book', chat_call: '📞 AI Call', chat_restart: '↺ Restart',
    },
  };

  var KEY = 'lmh_lang';
  var current = 'en';
  try { current = localStorage.getItem(KEY) || 'en'; } catch (e) { /* storage blocked */ }
  if (!D[current]) current = 'en';

  function t(key, fallback) {
    return (D[current] && D[current][key]) || D.en[key] || fallback || key;
  }
  function apply() {
    document.documentElement.lang = current;
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.hasAttribute('data-en')) el.setAttribute('data-en', el.textContent);
      var key = el.getAttribute('data-i18n');
      el.textContent = current === 'en' ? (D.en[key] || el.getAttribute('data-en')) : (D[current][key] || el.getAttribute('data-en'));
    }
    var btns = document.querySelectorAll('[data-lang]');
    for (var j = 0; j < btns.length; j++) btns[j].setAttribute('aria-pressed', String(btns[j].getAttribute('data-lang') === current));
  }
  function setLang(l) {
    if (!D[l]) return;
    current = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: l }));
  }
  window.I18N = { t: t, lang: function () { return current; }, setLang: setLang, apply: apply };
})();
