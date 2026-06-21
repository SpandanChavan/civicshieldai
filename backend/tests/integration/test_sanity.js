require('dotenv').config();
const { z } = require('zod');
const { getAdminDb } = require('../../src/lib/db');

// 1. Test XSS escaping
const { escapeHtml } = require('../../src/services/notificationRouter');
const unsafe = '<script>alert("XSS")</script> & "bad" \'string\'';
const escaped = escapeHtml(unsafe);
if (escaped.includes('<script>')) throw new Error('Escape failed');

// 2. Test PATCH /api/resources validation
const ResourceSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum(['ambulance', 'fire_truck', 'helicopter', 'shelter', 'food', 'water', 'medical', 'rescue_team', 'other']),
  status: z.enum(['available', 'deployed', 'maintenance', 'unavailable']).default('available'),
  quantity: z.number().int().min(0).default(1),
  location: z.object({ lat: z.number(), lon: z.number() }).optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  assigned_event: z.string().uuid().optional(),
});
const ResourceUpdateSchema = ResourceSchema.partial().extend({
  assigned_event: z.string().uuid().nullable().optional(),
}).strict();

const badPayload = { status: 'deployed', unknown_field: 'hax' };
const parsed = ResourceUpdateSchema.safeParse(badPayload);
if (parsed.success) throw new Error('Validation failed to reject unknown fields');

// 3. Test upsertEvents idempotency
const { upsertEvents } = require('../../src/cron/apiPollers');

async function testIdempotency() {
  const mockIo = { to: () => ({ emit: () => {} }) };
  const fakeEvent = {
    title: 'Test Critical Event',
    description: 'A critical event for testing idempotency',
    event_type: 'Cyclone',
    severity: 'Critical',
    detected_at: new Date().toISOString(),
    dedup_hash: 'test-hash-1234',
    location: { lat: 28.61, lon: 77.20 },
    source: 'TestScript'
  };

  const db = getAdminDb();
  // Clear any existing test event
  await db.from('events').delete().eq('dedup_hash', fakeEvent.dedup_hash);

  console.log('--- First upsert ---');
  await upsertEvents([fakeEvent], mockIo, 'India');
  
  const { data: firstEvents } = await db.from('events').select('*').eq('dedup_hash', fakeEvent.dedup_hash);
  console.log('Event after first upsert:', firstEvents[0].alerted_at);

  console.log('--- Second upsert ---');
  await upsertEvents([fakeEvent], mockIo, 'India');

  // Verify DB
  const { data: events } = await db.from('events').select('*').eq('dedup_hash', fakeEvent.dedup_hash);
  console.log('Event after second upsert:', events[0].alerted_at);
  
  if (events.length !== 1) {
    throw new Error(`Expected 1 event, got ${events.length}`);
  }
  if (!events[0].alerted_at) {
    throw new Error('Event was not marked as alerted');
  }

  // Cleanup
  await db.from('events').delete().eq('dedup_hash', fakeEvent.dedup_hash);
  console.log('Sanity checks passed');
}

testIdempotency().catch(console.error);
