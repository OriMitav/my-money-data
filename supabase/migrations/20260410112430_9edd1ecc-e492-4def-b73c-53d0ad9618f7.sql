CREATE TABLE public.geojson_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'default',
  geojson jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.geojson_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own layers" ON public.geojson_layers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own layers" ON public.geojson_layers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own layers" ON public.geojson_layers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own layers" ON public.geojson_layers FOR DELETE USING (auth.uid() = user_id);