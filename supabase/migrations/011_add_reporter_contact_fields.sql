-- Migration 011: Add reporter_name and reporter_contact to incident_reports
-- These fields are used by the backend incident submission schema but were missing in the DB.

ALTER TABLE public.incident_reports
ADD COLUMN IF NOT EXISTS reporter_name TEXT,
ADD COLUMN IF NOT EXISTS reporter_contact TEXT;
