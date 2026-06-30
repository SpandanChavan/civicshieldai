/**
 * frontend/src/components/sos/EmergencyContactsEditor.jsx
 *
 * Lets citizens save up to 3 emergency contacts.
 * These are sent SMS when the citizen triggers SOS.
 */

import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Users, Plus, X, Check, Save } from 'lucide-react';

export default function EmergencyContactsEditor({ initialContacts = [], userId }) {
  const [contacts, setContacts] = useState(
    initialContacts.length > 0
      ? initialContacts
      : [{ name: '', phone: '' }]
  );
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [error,  setError]    = useState('');

  const addContact = () => {
    if (contacts.length >= 3) return;
    setContacts(prev => [...prev, { name: '', phone: '' }]);
  };

  const removeContact = (index) => {
    setContacts(prev => prev.filter((_, i) => i !== index));
  };

  const updateContact = (index, field, value) => {
    setContacts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    const valid = contacts.filter(c => c.name.trim() && c.phone.trim());
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    for (const c of valid) {
      if (!phoneRegex.test(c.phone.replace(/\s/g, ''))) {
        setError(`Invalid phone: ${c.phone}. Format: +919876543210`);
        return;
      }
    }

    setSaving(true);
    setError('');

    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({ emergency_contacts: valid })
      .eq('id', userId);

    setSaving(false);

    if (updateErr) {
      setError('Failed to save. Please try again.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div style={{
      background:   '#131b2e',
      border:       '1px solid rgba(255,255,255,0.05)',
      borderRadius: '8px',
      padding:      '16px',
      marginTop:    '16px',
      fontFamily:   "'Inter', sans-serif"
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Users size={16} color="#38bdf8" />
        <h3 style={{ fontWeight: '600', margin: 0, fontSize: '14px', color: '#dae2fd', fontFamily: "'Space Grotesk', sans-serif" }}>
          Emergency Contacts
        </h3>
      </div>
      <p style={{ fontSize: '12px', color: '#bdc8d1', margin: '0 0 16px', lineHeight: 1.5 }}>
        These people receive an SMS with your location when you trigger SOS (max 3).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {contacts.map((contact, index) => (
          <div key={index} style={{
            display:       'flex',
            gap:           '8px',
            alignItems:    'center',
          }}>
            <input
              type="text"
              placeholder="Name"
              value={contact.name}
              onChange={(e) => updateContact(index, 'name', e.target.value)}
              className="cp-input"
              style={{ flex: 1, padding: '10px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0b1326', fontSize: '13px', color: '#dae2fd' }}
            />
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={contact.phone}
              onChange={(e) => updateContact(index, 'phone', e.target.value)}
              className="cp-input"
              style={{ flex: 1.2, padding: '10px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0b1326', fontSize: '13px', color: '#dae2fd' }}
            />
            <button
              onClick={() => removeContact(index)}
              style={{
                width:        '38px',
                height:       '38px',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                background:   'rgba(239, 68, 68, 0.1)',
                border:       '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '4px',
                color:        '#ef4444',
                cursor:       'pointer',
                flexShrink:   0
              }}
              aria-label="Remove contact"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ color: '#fca5a5', fontSize: '12px', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <X size={12} /> {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        {contacts.length < 3 && (
          <button
            onClick={addContact}
            style={{
              padding:      '8px 16px',
              background:   'rgba(134, 239, 172, 0.1)',
              border:       '1px solid rgba(134, 239, 172, 0.3)',
              borderRadius: '4px',
              color:        '#86efac',
              cursor:       'pointer',
              fontSize:     '12px',
              fontWeight:   '600',
              display:      'flex',
              alignItems:   'center',
              gap:          '6px'
            }}
          >
            <Plus size={14} /> Add Contact
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding:      '8px 20px',
            background:   saving ? 'rgba(255,255,255,0.1)' : '#38bdf8',
            border:       'none',
            borderRadius: '4px',
            color:        saving ? '#bdc8d1' : '#00354a',
            cursor:       saving ? 'not-allowed' : 'pointer',
            fontSize:     '12px',
            fontWeight:   '600',
            display:      'flex',
            alignItems:   'center',
            gap:          '6px'
          }}
        >
          {saving ? 'Saving...' : saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save Contacts</>}
        </button>
      </div>
    </div>
  );
}
