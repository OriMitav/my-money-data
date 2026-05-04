CREATE TABLE public.mortgage_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  property_id UUID NOT NULL,
  report_date DATE NOT NULL,
  total_balance_without_fees NUMERIC NOT NULL DEFAULT 0,
  total_balance_with_fees NUMERIC NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mortgage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mortgage snapshots"
ON public.mortgage_snapshots FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mortgage snapshots"
ON public.mortgage_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mortgage snapshots"
ON public.mortgage_snapshots FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mortgage snapshots"
ON public.mortgage_snapshots FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_mortgage_snapshots_property ON public.mortgage_snapshots(property_id, report_date DESC);

CREATE TRIGGER update_mortgage_snapshots_updated_at
BEFORE UPDATE ON public.mortgage_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();