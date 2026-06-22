# Row Level Security (RLS) Matrix

This document maps out the exact access control matrix for all 10 core tables in the CivicShield AI database across all 6 roles (`anon`, `citizen`, `responder`, `coordinator`, `admin`, and `service_role`).

## Roles Defined
- **anon**: Unauthenticated public visitors.
- **citizen**: Authenticated general users (default role on signup).
- **responder**: Authenticated on-the-ground agents (e.g., NDRF).
- **coordinator**: Authenticated operational managers.
- **admin**: Authenticated system administrators.
- **service_role**: Backend internal processes (bypasses RLS by default, but explicit policies enforce parity).

## Matrix

| Table | Operation | anon | citizen | responder | coordinator | admin | service_role | Verified? |
|-------|-----------|------|---------|-----------|-------------|-------|--------------|-----------|
| **states** | `SELECT` | All | All | All | All | All | All | Untested |
| | `INSERT` | Deny | Deny | Deny | Deny | Deny | All | Untested |
| | `UPDATE` | Deny | Deny | Deny | Deny | Deny | All | Untested |
| | `DELETE` | Deny | Deny | Deny | Deny | Deny | All | Untested |
| **events** | `SELECT` | `is_active=true` | `is_active=true` | `is_active=true` | All | All | All | Untested |
| | `INSERT` | Deny | Deny | Deny | All | All | All | Untested |
| | `UPDATE` | Deny | Deny | Deny | All | All | All | Untested |
| | `DELETE` | Deny | Deny | Deny | All | All | All | Untested |
| **alerts** | `SELECT` | `status='sent'` | `status='sent'` | `status='sent'` | All | All | All | Untested |
| | `INSERT` | Deny | Deny | Deny | All | All | All | Untested |
| | `UPDATE` | Deny | Deny | Deny | All | All | All | Untested |
| | `DELETE` | Deny | Deny | Deny | All | All | All | Untested |
| **resources** | `SELECT` | All | All | All | All | All | All | Untested |
| | `INSERT` | Deny | Deny | Deny | All | All | All | Untested |
| | `UPDATE` | Deny | Deny | Deny | All | All | All | Untested |
| | `DELETE` | Deny | Deny | Deny | All | All | All | Untested |
| **incident_reports** | `SELECT` | Deny | Own reports | All | All | All | All | Yes |
| | `INSERT` | Deny | Own (Auth) | Own (Auth) | Own (Auth) | Own (Auth) | All | Yes |
| | `UPDATE` | Deny | Deny | Deny | All | All | All | Yes |
| | `DELETE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| **alert_logs** | `SELECT` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `INSERT` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `UPDATE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `DELETE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| **user_profiles** | `SELECT` | Deny | All* | All* | All* | All* | All | Untested |
| | `INSERT` | Deny | Triggers only | Triggers only| Triggers only| Triggers only| All | Untested |
| | `UPDATE` | Deny | Own profile | Own profile | Own profile | Own profile | All | Untested |
| | `DELETE` | Deny | Deny | Deny | Deny | Deny | All | Untested |
| **audit_logs** | `SELECT` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `INSERT` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `UPDATE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `DELETE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| **misinformation_checks** | `SELECT` | Deny | Deny | Deny | All | All | All | Yes |
| | `INSERT` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `UPDATE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| | `DELETE` | Deny | Deny | Deny | Deny | Deny | All | Yes |
| **push_subscriptions** | `SELECT` | Deny | Own only | Own only | Own only | Own only | All | Untested |
| | `INSERT` | Deny | Own only | Own only | Own only | Own only | All | Untested |
| | `UPDATE` | Deny | Own only | Own only | Own only | Own only | All | Untested |
| | `DELETE` | Deny | Own only | Own only | Own only | Own only | All | Untested |

---

### Security Finding: `user_profiles` Global Read
The policy `"All authenticated users can read profiles"` allows any logged-in citizen to read the entire `user_profiles` table.
- **Intended Use**: This is required so the client UI can map `created_by` or `reviewer_id` UUIDs to human-readable `full_name` strings when displaying reports or operational assignments.
- **Data Exposure**: It exposes `id`, `role`, `full_name`, `state_id`, `assigned_at`, `created_at`, `updated_at`.
- **Conclusion**: There are no highly sensitive PII columns (like `email`, `phone`, or password hashes) stored in this table. Emails are locked safely inside the `auth.users` schema which is completely inaccessible to the frontend. Therefore, this policy is acceptable and intended.
