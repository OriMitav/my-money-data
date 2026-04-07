
CREATE TABLE public.earners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.earners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own earners" ON public.earners FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own earners" ON public.earners FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own earners" ON public.earners FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own earners" ON public.earners FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.income_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  earner_id UUID NOT NULL REFERENCES public.earners(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  source1_gross NUMERIC NOT NULL DEFAULT 0,
  source1_tax NUMERIC NOT NULL DEFAULT 0,
  source1_social NUMERIC NOT NULL DEFAULT 0,
  source2_gross NUMERIC NOT NULL DEFAULT 0,
  source2_tax NUMERIC NOT NULL DEFAULT 0,
  source2_social NUMERIC NOT NULL DEFAULT 0,
  source3_gross NUMERIC NOT NULL DEFAULT 0,
  source3_tax NUMERIC NOT NULL DEFAULT 0,
  source3_social NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(earner_id, year, month)
);

ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own income entries" ON public.income_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own income entries" ON public.income_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own income entries" ON public.income_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own income entries" ON public.income_entries FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_earners_updated_at BEFORE UPDATE ON public.earners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_income_entries_updated_at BEFORE UPDATE ON public.income_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
