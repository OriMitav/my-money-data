
-- Pension funds table
CREATE TABLE public.pension_funds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  employer TEXT NOT NULL DEFAULT '',
  fund_name TEXT NOT NULL DEFAULT '',
  accessible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pension_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pension funds" ON public.pension_funds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own pension funds" ON public.pension_funds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pension funds" ON public.pension_funds FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own pension funds" ON public.pension_funds FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_pension_funds_updated_at BEFORE UPDATE ON public.pension_funds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pension entries table
CREATE TABLE public.pension_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fund_id UUID NOT NULL REFERENCES public.pension_funds(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  employer TEXT NOT NULL DEFAULT '',
  fund_name TEXT NOT NULL DEFAULT '',
  employee_contribution NUMERIC NOT NULL DEFAULT 0,
  employer_contribution NUMERIC NOT NULL DEFAULT 0,
  compensation NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(fund_id, year, month)
);

ALTER TABLE public.pension_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pension entries" ON public.pension_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own pension entries" ON public.pension_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pension entries" ON public.pension_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own pension entries" ON public.pension_entries FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_pension_entries_updated_at BEFORE UPDATE ON public.pension_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pension settings table
CREATE TABLE public.pension_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  default_employer TEXT NOT NULL DEFAULT '',
  default_fund_name TEXT NOT NULL DEFAULT '',
  deposit_fee_pct NUMERIC NOT NULL DEFAULT 0,
  accumulation_fee_pct NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pension_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pension settings" ON public.pension_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own pension settings" ON public.pension_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pension settings" ON public.pension_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_pension_settings_updated_at BEFORE UPDATE ON public.pension_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
