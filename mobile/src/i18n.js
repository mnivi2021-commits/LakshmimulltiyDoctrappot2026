import { createContext, useContext } from 'react';

const S = {
  en: {
    hospital: 'Lakshmi Multispecialty Hospital', city: 'Viruthunagar, Tamil Nadu',
    home: 'Home', doctors: 'Doctors', book: 'Book', chat: 'AI Chat', status: 'Status',
    welcome: 'Welcome to Lakshmi Multispecialty Hospital. How can I help you?',
    btn_book: 'BOOK APPOINTMENT', btn_ai: 'AI CALL', btn_chat: 'CHAT BOX',
    morning: 'Morning', evening: 'Evening', mon_sat: 'Monday – Saturday',
    choose_doctor: 'Choose doctor', choose_date: 'Choose date', choose_time: 'Choose time',
    no_free: 'No free time in this session.', next_avail: 'First available appointment:', book_this: 'Book this',
    name: 'Patient name', mobile: 'Mobile number', new_p: 'New patient', existing_p: 'Existing patient', reason: 'Reason for visit',
    confirm: 'Confirm Appointment', confirmed: 'Appointment Confirmed', appt_no: 'Appointment No', doctor: 'Doctor', dept: 'Department',
    date: 'Date', time: 'Time', patient: 'Patient', status_l: 'Status', keep_no: 'Please keep this number. Arrive 10 minutes early.',
    book_again: 'Book another', check: 'Check Status', cancel_appt: 'Cancel appointment', cancel_q: 'Cancel this appointment?',
    yes: 'Yes', no: 'No', net_err: 'Connection problem. Nothing was booked. Please try again.', loading: 'Checking…',
    pick_time: 'Please choose a time.', fix: 'Please correct:', send: 'Send', type_msg: 'Type your message…', only_real: 'Only real free times are shown.',
    emergency: 'For emergencies call 108.',
  },
  ta: {
    hospital: 'லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனை', city: 'விருதுநகர், தமிழ்நாடு',
    home: 'முகப்பு', doctors: 'மருத்துவர்கள்', book: 'முன்பதிவு', chat: 'AI சாட்', status: 'நிலை',
    welcome: 'லட்சுமி மல்டிஸ்பெஷாலிட்டி மருத்துவமனைக்கு வரவேற்கிறோம். உங்களுக்கு எப்படி உதவலாம்?',
    btn_book: 'சந்திப்பு முன்பதிவு', btn_ai: 'AI அழைப்பு', btn_chat: 'அரட்டைப் பெட்டி',
    morning: 'காலை', evening: 'மாலை', mon_sat: 'திங்கள் – சனி',
    choose_doctor: 'மருத்துவரைத் தேர்வு செய்யவும்', choose_date: 'தேதியைத் தேர்வு செய்யவும்', choose_time: 'நேரத்தைத் தேர்வு செய்யவும்',
    no_free: 'இந்த அமர்வில் காலி நேரம் இல்லை.', next_avail: 'முதலில் கிடைக்கும் நேரம்:', book_this: 'இதை முன்பதிவு செய்',
    name: 'நோயாளியின் பெயர்', mobile: 'மொபைல் எண்', new_p: 'புதிய நோயாளி', existing_p: 'பழைய நோயாளி', reason: 'வருகைக்கான காரணம்',
    confirm: 'சந்திப்பை உறுதி செய்', confirmed: 'சந்திப்பு உறுதி செய்யப்பட்டது', appt_no: 'சந்திப்பு எண்', doctor: 'மருத்துவர்', dept: 'பிரிவு',
    date: 'தேதி', time: 'நேரம்', patient: 'நோயாளி', status_l: 'நிலை', keep_no: 'இந்த எண்ணைச் சேமித்து வைக்கவும். 10 நிமிடங்கள் முன்னதாக வரவும்.',
    book_again: 'மற்றொரு முன்பதிவு', check: 'நிலையைச் சரிபார்', cancel_appt: 'சந்திப்பை ரத்து செய்', cancel_q: 'இந்த சந்திப்பை ரத்து செய்யவா?',
    yes: 'ஆம்', no: 'இல்லை', net_err: 'இணைப்பு பிழை. எதுவும் முன்பதிவு செய்யப்படவில்லை.', loading: 'சரிபார்க்கிறது…',
    pick_time: 'ஒரு நேரத்தைத் தேர்வு செய்யவும்.', fix: 'தயவுசெய்து சரிசெய்யவும்:', send: 'அனுப்பு', type_msg: 'உங்கள் செய்தியை எழுதவும்…', only_real: 'உண்மையான காலி நேரங்கள் மட்டுமே காட்டப்படும்.',
    emergency: 'அவசர நிலையில் 108 ஐ அழைக்கவும்.',
  },
  hi: {
    hospital: 'लक्ष्मी मल्टीस्पेशलिटी हॉस्पिटल', city: 'विरुधुनगर, तमिलनाडु',
    home: 'होम', doctors: 'डॉक्टर', book: 'बुक', chat: 'AI चैट', status: 'स्थिति',
    welcome: 'लक्ष्मी मल्टीस्पेशलिटी हॉस्पिटल में आपका स्वागत है। मैं आपकी कैसे सहायता कर सकता हूँ?',
    btn_book: 'अपॉइंटमेंट बुक करें', btn_ai: 'AI कॉल', btn_chat: 'चैट बॉक्स',
    morning: 'सुबह', evening: 'शाम', mon_sat: 'सोमवार – शनिवार',
    choose_doctor: 'डॉक्टर चुनें', choose_date: 'तारीख चुनें', choose_time: 'समय चुनें',
    no_free: 'इस सत्र में कोई खाली समय नहीं है।', next_avail: 'पहला उपलब्ध अपॉइंटमेंट:', book_this: 'यह बुक करें',
    name: 'मरीज़ का नाम', mobile: 'मोबाइल नंबर', new_p: 'नया मरीज़', existing_p: 'पुराना मरीज़', reason: 'आने का कारण',
    confirm: 'अपॉइंटमेंट कन्फ़र्म करें', confirmed: 'अपॉइंटमेंट कन्फ़र्म हो गया', appt_no: 'अपॉइंटमेंट नंबर', doctor: 'डॉक्टर', dept: 'विभाग',
    date: 'तारीख', time: 'समय', patient: 'मरीज़', status_l: 'स्थिति', keep_no: 'यह नंबर संभालकर रखें। 10 मिनट पहले पहुँचें।',
    book_again: 'एक और बुक करें', check: 'स्थिति देखें', cancel_appt: 'अपॉइंटमेंट रद्द करें', cancel_q: 'क्या यह अपॉइंटमेंट रद्द करें?',
    yes: 'हाँ', no: 'नहीं', net_err: 'कनेक्शन त्रुटि। कुछ भी बुक नहीं हुआ।', loading: 'जाँच रहे हैं…',
    pick_time: 'कृपया एक समय चुनें।', fix: 'कृपया ठीक करें:', send: 'भेजें', type_msg: 'अपना संदेश लिखें…', only_real: 'सिर्फ़ असली खाली समय दिखाए जाते हैं।',
    emergency: 'आपातकाल में 108 पर कॉल करें।',
  },
};

export const LangContext = createContext({ lang: 'en', setLang: () => {} });
export function useT() {
  const { lang } = useContext(LangContext);
  return (k) => (S[lang] && S[lang][k]) || S.en[k] || k;
}
