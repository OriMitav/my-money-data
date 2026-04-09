
-- Add life expectancy age to pension_funds
ALTER TABLE public.pension_funds ADD COLUMN life_expectancy_age integer NOT NULL DEFAULT 85;

-- Create debts table
CREATE TABLE public.debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  debtor_name TEXT NOT NULL DEFAULT '',
  is_zero_interest BOOLEAN NOT NULL DEFAULT false,
  fixed_payment_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own debts" ON public.debts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own debts" ON public.debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own debts" ON public.debts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own debts" ON public.debts FOR DELETE USING (auth.uid() = user_id);

-- Create debt_entries table
CREATE TABLE public.debt_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  interest_paid NUMERIC NOT NULL DEFAULT 0,
  principal_paid NUMERIC NOT NULL DEFAULT 0,
  total_paid NUMERIC NOT NULL DEFAULT 0,
  remaining_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own debt entries" ON public.debt_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own debt entries" ON public.debt_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own debt entries" ON public.debt_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own debt entries" ON public.debt_entries FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_debt_entries_updated_at BEFORE UPDATE ON public.debt_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
