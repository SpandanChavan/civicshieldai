import { useState } from 'react';

const CHANNELS = ['web_push', 'whatsapp', 'sms', 'email', 'telegram', 'multilingual'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

export default function AlertForm({ eventId, onSuccess, createAlert, isCreating }) {
  const [form, setForm] = useState({
    title: '',
    body: '',
    severity: 'Medium',
    channels: ['web_push'],
    event_id: eventId || '',
    recipients: { emails: '', telegramChatIds: '', whatsappNumbers: '', smsNumbers: '' },
  });
  const [error, setError] = useState('');

  const toggleChannel = (ch) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message are required.');
      return;
    }

    const payload = {
      ...form,
      event_id: form.event_id || undefined,
      recipients: {
        emails: form.recipients.emails.split(',').map(s => s.trim()).filter(Boolean),
        telegramChatIds: form.recipients.telegramChatIds.split(',').map(s => s.trim()).filter(Boolean),
        whatsappNumbers: form.recipients.whatsappNumbers.split(',').map(s => s.trim()).filter(Boolean),
        smsNumbers: form.recipients.smsNumbers.split(',').map(s => s.trim()).filter(Boolean),
      },
    };

    createAlert(payload, {
      onSuccess: () => {
        setForm({ title: '', body: '', severity: 'Medium', channels: ['web_push'], event_id: '', recipients: { emails: '', telegramChatIds: '', whatsappNumbers: '', smsNumbers: '' } });
        onSuccess?.();
      },
      onError: (err) => setError(err.message),
    });
  };

  return (
    <form
      id="alert-create-form"
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label="Create alert form"
    >
      <div>
        <label htmlFor="alert-title" className="block text-xs font-medium text-slate-400 mb-1">
          Alert Title *
        </label>
        <input
          id="alert-title"
          className="input"
          placeholder="e.g., High-risk earthquake detected near Mumbai"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />
      </div>

      <div>
        <label htmlFor="alert-body" className="block text-xs font-medium text-slate-400 mb-1">
          Alert Message *
        </label>
        <textarea
          id="alert-body"
          className="input min-h-[80px] resize-y"
          placeholder="Detailed instructions for residents and responders..."
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          required
        />
      </div>

      <div>
        <label htmlFor="alert-severity" className="block text-xs font-medium text-slate-400 mb-1">
          Severity
        </label>
        <select
          id="alert-severity"
          className="input"
          value={form.severity}
          onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-400 mb-2">Notification Channels</p>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              id={`channel-${ch}`}
              onClick={() => toggleChannel(ch)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                form.channels.includes(ch)
                  ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                  : 'border-white/10 text-slate-400 hover:border-white/30'
              }`}
            >
              {ch.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {form.channels.includes('email') && (
        <div>
          <label htmlFor="recipient-emails" className="block text-xs font-medium text-slate-400 mb-1">
            Email Recipients (comma-separated)
          </label>
          <input
            id="recipient-emails"
            className="input"
            placeholder="admin@ndma.gov.in, ops@district.gov.in"
            value={form.recipients.emails}
            onChange={(e) => setForm((f) => ({ ...f, recipients: { ...f.recipients, emails: e.target.value } }))}
          />
        </div>
      )}

      {form.channels.includes('telegram') && (
        <div>
          <label htmlFor="telegram-ids" className="block text-xs font-medium text-slate-400 mb-1">
            Telegram Chat IDs (comma-separated)
          </label>
          <input
            id="telegram-ids"
            className="input"
            placeholder="-100123456789, 987654321"
            value={form.recipients.telegramChatIds}
            onChange={(e) => setForm((f) => ({ ...f, recipients: { ...f.recipients, telegramChatIds: e.target.value } }))}
          />
        </div>
      )}

      {form.channels.includes('whatsapp') && (
        <div>
          <label htmlFor="whatsapp-numbers" className="block text-xs font-medium text-slate-400 mb-1">
            WhatsApp Numbers (comma-separated with country code)
          </label>
          <input
            id="whatsapp-numbers"
            className="input"
            placeholder="+919876543210, +14155552671"
            value={form.recipients.whatsappNumbers}
            onChange={(e) => setForm((f) => ({ ...f, recipients: { ...f.recipients, whatsappNumbers: e.target.value } }))}
          />
        </div>
      )}

      {form.channels.includes('sms') && (
        <div>
          <label htmlFor="sms-numbers" className="block text-xs font-medium text-slate-400 mb-1">
            SMS Numbers (comma-separated with country code)
          </label>
          <input
            id="sms-numbers"
            className="input"
            placeholder="+919876543210, +14155552671"
            value={form.recipients.smsNumbers}
            onChange={(e) => setForm((f) => ({ ...f, recipients: { ...f.recipients, smsNumbers: e.target.value } }))}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        id="alert-submit-btn"
        disabled={isCreating}
        className="btn-danger w-full justify-center"
      >
        {isCreating ? (
          <span className="flex items-center gap-2"><span className="spinner" /> Sending Alert…</span>
        ) : (
          '🚨 Send Alert'
        )}
      </button>
    </form>
  );
}
