-- Add category to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category_id uuid;

-- Mapping of recipient name -> category (per user)
CREATE TABLE IF NOT EXISTS public.recipient_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recipient_name text NOT NULL,
  category_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipient_name)
);

ALTER TABLE public.recipient_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recipient categories"
ON public.recipient_categories FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recipient categories"
ON public.recipient_categories FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipient categories"
ON public.recipient_categories FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipient categories"
ON public.recipient_categories FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_recipient_categories_updated_at
BEFORE UPDATE ON public.recipient_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_recipient_categories_user ON public.recipient_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);
