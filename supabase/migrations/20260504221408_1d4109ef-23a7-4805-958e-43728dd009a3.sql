
CREATE TABLE public.property_cashflow (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  subject TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.property_cashflow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cashflow" ON public.property_cashflow
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own cashflow" ON public.property_cashflow
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own cashflow" ON public.property_cashflow
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own cashflow" ON public.property_cashflow
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_property_cashflow_property ON public.property_cashflow(property_id, entry_date DESC);
CREATE UNIQUE INDEX idx_property_cashflow_mortgage_dedup
  ON public.property_cashflow(property_id, source, source_ref)
  WHERE source = 'mortgage';

CREATE TRIGGER update_property_cashflow_updated_at
  BEFORE UPDATE ON public.property_cashflow
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
