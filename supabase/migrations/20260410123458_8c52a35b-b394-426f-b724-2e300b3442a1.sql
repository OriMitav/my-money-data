-- Add photo_url column to pension_funds for child photos
ALTER TABLE public.pension_funds ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '';

-- Create storage bucket for child photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('child-photos', 'child-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to child-photos
CREATE POLICY "Users can upload child photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'child-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read
CREATE POLICY "Public can read child photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'child-photos');

-- Allow users to delete their own photos
CREATE POLICY "Users can delete their child photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'child-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to update their own photos
CREATE POLICY "Users can update their child photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'child-photos' AND (storage.foldername(name))[1] = auth.uid()::text);