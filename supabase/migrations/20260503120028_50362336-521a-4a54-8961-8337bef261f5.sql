
CREATE TABLE public.recipient_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recipient_name text NOT NULL,
  field text NOT NULL CHECK (field IN ('relevant','subscription')),
  value boolean NOT NULL,
  from_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipient_name, field)
);

ALTER TABLE public.recipient_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recipient preferences"
ON public.recipient_preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recipient preferences"
ON public.recipient_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipient preferences"
ON public.recipient_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipient preferences"
ON public.recipient_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_recipient_preferences_updated_at
BEFORE UPDATE ON public.recipient_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_recipient_preferences_user_recipient
ON public.recipient_preferences (user_id, recipient_name);
