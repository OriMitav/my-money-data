
-- Create timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Financial Entities table
CREATE TABLE public.financial_entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'credit_card')),
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entities" ON public.financial_entities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own entities" ON public.financial_entities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own entities" ON public.financial_entities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own entities" ON public.financial_entities FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_financial_entities_updated_at BEFORE UPDATE ON public.financial_entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.financial_entities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source_recipient TEXT,
  value NUMERIC NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_transactions_entity_id ON public.transactions(entity_id);
CREATE INDEX idx_transactions_date ON public.transactions(date);
