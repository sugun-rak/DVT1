import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      "app_title": "Digital Voting System",
      "voter_verification": "Voter Verification",
      "place_id": "Place Voter ID to Scan",
      "scanning": "Scanning Voter ID...",
      "simulate_scan": "Simulate Scan & Generate OTP",
      "scan_success": "Scan Successful!",
      "your_ack": "Your Acknowledge Number is:",
      "enter_ack": "Enter Acknowledge Number",
      "start_session": "Start Voting Session",
      "starting": "Starting Session...",
      "voter_info": "Voter Information",
      "name": "Name",
      "version": "Version ID",
      "constituency": "Constituency",
      "select_party": "Select Your Party",
      "select_party_desc": "Please click on the party symbol to proceed to candidate confirmation.",
      "confirm_selection": "Confirm Selection",
      "confirm_desc": "Review the candidate details before casting your vote.",
      "back_clear": "Back (Clear Selection)",
      "confirm_vote": "Confirm Vote",
      "recording": "Recording...",
      "vote_cast": "Vote Successfully Cast!",
      "session_id": "Session ID",
      "ack_invalid": "is now invalid.",
      "vvpat_verify": "VVPAT Verification",
      "vvpat_machine": "VVPAT Machine",
      "finish": "Finish & Start New Session",
      "admin_login": "Admin Login",
      "enter_pin": "Enter Admin PIN",
      "login": "Login",
      "admin_dashboard": "Admin Dashboard",
      "manage_parties": "Manage Parties & Candidates",
      "logout": "Logout"
    }
  },
  hi: {
    translation: {
      "app_title": "डिजिटल वोटिंग सिस्टम",
      "voter_verification": "मतदाता सत्यापन",
      "place_id": "स्कैन करने के लिए वोटर आईडी रखें",
      "scanning": "वोटर आईडी स्कैन हो रहा है...",
      "simulate_scan": "स्कैन अनुकरण करें और OTP जनरेट करें",
      "scan_success": "स्कैन सफल!",
      "your_ack": "आपका पावती नंबर है:",
      "enter_ack": "पावती नंबर दर्ज करें",
      "start_session": "वोटिंग सत्र शुरू करें",
      "starting": "सत्र शुरू हो रहा है...",
      "voter_info": "मतदाता जानकारी",
      "name": "नाम",
      "version": "संस्करण आईडी",
      "constituency": "निर्वाचन क्षेत्र",
      "select_party": "अपनी पार्टी चुनें",
      "select_party_desc": "उम्मीदवार की पुष्टि के लिए कृपया पार्टी के चुनाव चिह्न पर क्लिक करें।",
      "confirm_selection": "चयन की पुष्टि करें",
      "confirm_desc": "अपना वोट डालने से पहले उम्मीदवार के विवरण की समीक्षा करें।",
      "back_clear": "वापस जाएँ (चयन साफ़ करें)",
      "confirm_vote": "वोट की पुष्टि करें",
      "recording": "रिकॉर्ड हो रहा है...",
      "vote_cast": "वोट सफलतापूर्वक डाला गया!",
      "session_id": "सत्र आईडी",
      "ack_invalid": "अब अमान्य है।",
      "vvpat_verify": "VVPAT सत्यापन",
      "vvpat_machine": "VVPAT मशीन",
      "finish": "समाप्त करें और नया सत्र शुरू करें",
      "admin_login": "व्यवस्थापक लॉगिन",
      "enter_pin": "व्यवस्थापक पिन दर्ज करें",
      "login": "लॉग इन करें",
      "admin_dashboard": "व्यवस्थापक डैशबोर्ड",
      "manage_parties": "पार्टियों और उम्मीदवारों का प्रबंधन करें",
      "logout": "लॉग आउट"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en", 
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
