/**
 * frontend/src/components/sos/EmergencyContactsEditor.jsx
 *
 * Lets citizens save up to 3 emergency contacts.
 * These are sent SMS when the citizen triggers SOS.
 */

import { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

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
    // Validate: phone numbers should start with + and contain digits
    const valid = contacts.filter(c => c.name.trim() && c.phone.trim());
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    for (const c of valid) {
      if (!phoneRegex.test(c.phone.replace(/\s/g, ''))) {
        setError(`Invalid phone number: ${c.phone}. Use format: +919876543210`);
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
      background:   '#fff',
      border:       '1px solid #ddd',
      borderRadius: '12px',
      padding:      '1rem',
      marginTop:    '1rem',
    }}>
      <h3 style={{ fontWeight: '600', marginBottom: '4px', fontSize: '15px' }}>
        🚨 Emergency Contacts
      </h3>
      <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
        These people receive an SMS with your location when you trigger SOS (max 3).
      </p>

      {contacts.map((contact, index) => (
        <div key={index} style={{
          display:       'flex',
          gap:           '8px',
          marginBottom:  '8px',
          alignItems:    'center',
        }}>
          <input
            type="text"
            placeholder="Name"
            value={contact.name}
            onChange={(e) => updateContact(index, 'name', e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', color: '#333' }}
          />
          <input
            type="tel"
            placeholder="+91 98765 43210"
            value={contact.phone}
            onChange={(e) => updateContact(index, 'phone', e.target.value)}
            style={{ flex: 1.2, padding: '8px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', color: '#333' }}
          />
          <button
            onClick={() => removeContact(index)}
            style={{
              padding:      '8px 10px',
              background:   'transparent',
              border:       '1px solid #e57373',
              borderRadius: '8px',
              color:        '#e57373',
              cursor:       'pointer',
              fontSize:     '14px',
            }}
            aria-label="Remove contact"
          >
            ✕
          </button>
        </div>
      ))}

      {error && (
        <p style={{ color: '#C0392B', fontSize: '13px', marginBottom: '8px' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        {contacts.length < 3 && (
          <button
            onClick={addContact}
            style={{
              padding:      '8px 16px',
              background:   'transparent',
              border:       '1px solid #43A047',
              borderRadius: '8px',
              color:        '#43A047',
              cursor:       'pointer',
              fontSize:     '13px',
            }}
          >
            + Add Contact
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding:      '8px 20px',
            background:   saving ? '#ccc' : '#1565C0',
            border:       'none',
            borderRadius: '8px',
            color:        '#fff',
            cursor:       saving ? 'not-allowed' : 'pointer',
            fontSize:     '13px',
            fontWeight:   '500',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Contacts'}
        </button>
      </div>
    </div>
  );
}
