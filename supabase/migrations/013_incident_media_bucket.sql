-- Migration 013: Incident Media Storage Bucket
-- Creates a public bucket for incident reports and configures RLS.

INSERT INTO storage.buckets (id, name, public) 
VALUES ('incident-media', 'incident-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage.objects
-- Allow anyone to read
CREATE POLICY "Public read access for incident media" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'incident-media');

-- Allow authenticated users to insert (upload)
CREATE POLICY "Authenticated users can upload incident media" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'incident-media' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their own uploads (optional but good practice)
CREATE POLICY "Users can update own incident media" 
ON storage.objects FOR UPDATE 
USING (
  bucket_id = 'incident-media' 
  AND auth.uid() = owner
);

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Users can delete own incident media" 
ON storage.objects FOR DELETE 
USING (
  bucket_id = 'incident-media' 
  AND auth.uid() = owner
);
