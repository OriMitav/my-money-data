
ALTER TABLE public.pension_settings ADD COLUMN checking_balance numeric NOT NULL DEFAULT 0;

ALTER TABLE public.pension_funds ADD COLUMN birth_date date;
ALTER TABLE public.pension_funds ADD COLUMN retirement_age integer NOT NULL DEFAULT 67;
ALTER TABLE public.pension_funds ADD COLUMN end_savings_age integer NOT NULL DEFAULT 18;
