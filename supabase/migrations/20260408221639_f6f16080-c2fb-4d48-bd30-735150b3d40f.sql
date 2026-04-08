
-- Add per-fund fee settings
ALTER TABLE public.pension_funds
  ADD COLUMN deposit_fee_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN accumulation_fee_pct numeric NOT NULL DEFAULT 0;

-- Add new columns to pension_entries from the Excel structure
ALTER TABLE public.pension_entries
  ADD COLUMN management_fees numeric NOT NULL DEFAULT 0,
  ADD COLUMN monthly_growth numeric NOT NULL DEFAULT 0,
  ADD COLUMN monthly_return numeric NOT NULL DEFAULT 0;
