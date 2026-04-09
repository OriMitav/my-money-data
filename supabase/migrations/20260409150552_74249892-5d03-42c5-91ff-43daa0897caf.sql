
-- Properties table
CREATE TABLE public.properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  house_number TEXT NOT NULL DEFAULT '',
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  apify_token TEXT NOT NULL DEFAULT '',
  apify_actor_sale_id TEXT NOT NULL DEFAULT '',
  apify_actor_rent_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own properties" ON public.properties FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own properties" ON public.properties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own properties" ON public.properties FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own properties" ON public.properties FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Property snapshots table
CREATE TABLE public.property_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'sale',
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  avg_price NUMERIC NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  std_deviation NUMERIC NOT NULL DEFAULT 0,
  raw_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, type, year, month)
);

ALTER TABLE public.property_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own snapshots" ON public.property_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own snapshots" ON public.property_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own snapshots" ON public.property_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own snapshots" ON public.property_snapshots FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_property_snapshots_updated_at BEFORE UPDATE ON public.property_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
