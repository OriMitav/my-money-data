
-- Add enrichment columns to transactions
ALTER TABLE public.transactions
  ADD COLUMN relevant_transaction BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN subscription BOOLEAN NOT NULL DEFAULT false;

-- Create recipient mappings table
CREATE TABLE public.recipient_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_name TEXT NOT NULL,
  custom_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, original_name)
);

ALTER TABLE public.recipient_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mappings"
  ON public.recipient_mappings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mappings"
  ON public.recipient_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mappings"
  ON public.recipient_mappings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mappings"
  ON public.recipient_mappings FOR DELETE
  USING (auth.uid() = user_id);
