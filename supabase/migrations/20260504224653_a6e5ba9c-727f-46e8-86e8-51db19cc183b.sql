-- Add for_whom column to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS for_whom TEXT;

-- Create rules table for "For Whom" auto-application
CREATE TABLE IF NOT EXISTS public.for_whom_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_recipient TEXT NOT NULL,
  for_whom TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_recipient)
);

ALTER TABLE public.for_whom_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own for_whom rules" ON public.for_whom_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own for_whom rules" ON public.for_whom_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own for_whom rules" ON public.for_whom_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own for_whom rules" ON public.for_whom_rules FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER for_whom_rules_updated_at BEFORE UPDATE ON public.for_whom_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when a new transaction is inserted, auto-fill for_whom from rules
CREATE OR REPLACE FUNCTION public.apply_for_whom_rule()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.for_whom IS NULL AND NEW.source_recipient IS NOT NULL THEN
    SELECT for_whom INTO NEW.for_whom FROM public.for_whom_rules
    WHERE user_id = NEW.user_id AND source_recipient = NEW.source_recipient LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_for_whom_rule_trigger ON public.transactions;
CREATE TRIGGER apply_for_whom_rule_trigger
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_for_whom_rule();