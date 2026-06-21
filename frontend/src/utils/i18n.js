/**
 * i18n.js — Lightweight bilingual translation system (English + Hindi)
 * Used via useTranslation() hook throughout the app.
 */

export const LANGUAGES = [
  { code: 'en', label: 'EN', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हि', nativeLabel: 'हिंदी', flag: '🇮🇳' },
];

const translations = {
  en: {
    // Navbar
    'nav.portal':      '🌍 Public Portal',
    'nav.dashboard':   '🎛️ Coordinator',
    'nav.responder':   '📱 Responder',
    'nav.live':        'Live',
    'nav.offline':     'Offline',
    'nav.events':      'active events',
    'nav.updated':     'Updated',

    // Severity
    'severity.Critical': 'Critical',
    'severity.High':     'High',
    'severity.Medium':   'Medium',
    'severity.Low':      'Low',

    // Event types
    'type.Earthquake': 'Earthquake',
    'type.Wildfire':   'Wildfire',
    'type.Flood':      'Flood',
    'type.Cyclone':    'Cyclone',
    'type.Tsunami':    'Tsunami',
    'type.Landslide':  'Landslide',
    'type.Drought':    'Drought',
    'type.Heatwave':   'Heatwave',
    'type.Cold Wave':  'Cold Wave',
    'type.Volcano':    'Volcano',

    // Map controls
    'map.fitAll':      'Fit All',
    'map.india':       '🇮🇳 India',
    'map.search':      'Search city, district or PIN...',
    'map.clearFilter': '✕ Clear',
    'map.legend':      'IMD Warning Levels',

    // IMD legend
    'imd.green':       'Green — Watch',
    'imd.yellow':      'Yellow — Alert',
    'imd.orange':      'Orange — Warning',
    'imd.red':         'Red — Extreme Warning',

    // NDRF panel
    'ndrf.title':       'India Emergency Resources',
    'ndrf.helpline':    'National Helpline',
    'ndrf.battalions':  'NDRF Battalions',
    'ndrf.state_sdrf':  'State Helplines (SDRF)',
    'ndrf.call':        'Call',
    'ndrf.monsoon':     'Monsoon Season Active',
    'ndrf.flood_risk':  'Flood Risk',
    'ndrf.rainfall':    'Cumulative Rainfall',
    'ndrf.of_normal':   '% of Normal',

    // Sidebar / dashboard
    'sidebar.alerts':       'Active Alerts',
    'sidebar.resources':    'Resources',
    'sidebar.incidents':    'Incidents',
    'sidebar.no_events':    'No active events',
    'sidebar.all_clear':    'All clear — no active disasters',
    'sidebar.loading':      'Loading events...',

    // Monsoon
    'monsoon.active':   'Monsoon Season',
    'monsoon.watch':    'Monsoon Watch',
    'monsoon.onset':    'Monsoon Onset',
    'monsoon.normal':   'Normal',
    'monsoon.deficient':'Deficient',
    'monsoon.excess':   'Excess',
  },

  hi: {
    // Navbar
    'nav.portal':      '🌍 सार्वजनिक पोर्टल',
    'nav.dashboard':   '🎛️ समन्वयक',
    'nav.responder':   '📱 आपदा दल',
    'nav.live':        'सक्रिय',
    'nav.offline':     'ऑफलाइन',
    'nav.events':      'सक्रिय घटनाएं',
    'nav.updated':     'अपडेट',

    // Severity
    'severity.Critical': 'अति गंभीर',
    'severity.High':     'उच्च',
    'severity.Medium':   'मध्यम',
    'severity.Low':      'न्यून',

    // Event types
    'type.Earthquake': 'भूकंप',
    'type.Wildfire':   'जंगल की आग',
    'type.Flood':      'बाढ़',
    'type.Cyclone':    'चक्रवात',
    'type.Tsunami':    'सुनामी',
    'type.Landslide':  'भूस्खलन',
    'type.Drought':    'सूखा',
    'type.Heatwave':   'लू',
    'type.Cold Wave':  'शीत लहर',
    'type.Volcano':    'ज्वालामुखी',

    // Map controls
    'map.fitAll':      'सभी देखें',
    'map.india':       '🇮🇳 भारत',
    'map.search':      'शहर, जिला या पिन खोजें...',
    'map.clearFilter': '✕ हटाएं',
    'map.legend':      'IMD चेतावनी स्तर',

    // IMD legend
    'imd.green':       'हरा — निगरानी',
    'imd.yellow':      'पीला — सतर्कता',
    'imd.orange':      'नारंगी — चेतावनी',
    'imd.red':         'लाल — अत्यंत चेतावनी',

    // NDRF panel
    'ndrf.title':       'भारत आपातकालीन संसाधन',
    'ndrf.helpline':    'राष्ट्रीय हेल्पलाइन',
    'ndrf.battalions':  'NDRF बटालियन',
    'ndrf.state_sdrf':  'राज्य हेल्पलाइन (SDRF)',
    'ndrf.call':        'कॉल करें',
    'ndrf.monsoon':     'मानसून सीजन सक्रिय',
    'ndrf.flood_risk':  'बाढ़ जोखिम',
    'ndrf.rainfall':    'संचयी वर्षा',
    'ndrf.of_normal':   '% सामान्य का',

    // Sidebar
    'sidebar.alerts':       'सक्रिय अलर्ट',
    'sidebar.resources':    'संसाधन',
    'sidebar.incidents':    'घटनाएं',
    'sidebar.no_events':    'कोई सक्रिय घटना नहीं',
    'sidebar.all_clear':    'सब ठीक — कोई सक्रिय आपदा नहीं',
    'sidebar.loading':      'लोड हो रहा है...',

    // Monsoon
    'monsoon.active':   'मानसून सीजन',
    'monsoon.watch':    'मानसून निगरानी',
    'monsoon.onset':    'मानसून आगमन',
    'monsoon.normal':   'सामान्य',
    'monsoon.deficient':'अपर्याप्त',
    'monsoon.excess':   'अतिरिक्त',
  },
};

/**
 * Translate a key into the given language.
 * Falls back to English if the key is missing in the target language.
 */
export function t(key, lang = 'en') {
  return translations[lang]?.[key] ?? translations['en']?.[key] ?? key;
}

/**
 * React hook — returns a translator bound to the current app language.
 * Usage:  const { t } = useTranslation();
 */
import { useCallback } from 'react';
import useAppStore from '@/store/useAppStore';

export function useTranslation() {
  const lang = useAppStore((s) => s.language);
  const translate = useCallback((key) => t(key, lang), [lang]);
  return { t: translate, lang };
}
