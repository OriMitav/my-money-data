CREATE TABLE public.mortgage_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  property_value NUMERIC NOT NULL DEFAULT 0,
  mortgage_amount NUMERIC NOT NULL DEFAULT 0,
  income NUMERIC NOT NULL DEFAULT 0,
  mixes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.mortgage_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mortgage comparisons"
ON public.mortgage_comparisons FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own mortgage comparisons"
ON public.mortgage_comparisons FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mortgage comparisons"
ON public.mortgage_comparisons FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mortgage comparisons"
ON public.mortgage_comparisons FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_mortgage_comparisons_updated_at
BEFORE UPDATE ON public.mortgage_comparisons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();