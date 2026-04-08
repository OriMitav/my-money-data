
ALTER TABLE public.pension_funds
  ADD COLUMN type text NOT NULL DEFAULT 'pension',
  ADD COLUMN parent_matching boolean NOT NULL DEFAULT false,
  ADD COLUMN state_deposit_amount numeric NOT NULL DEFAULT 0;
