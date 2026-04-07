ALTER TABLE public.income_entries
  ADD COLUMN source1_employer TEXT NOT NULL DEFAULT '',
  ADD COLUMN source2_employer TEXT NOT NULL DEFAULT '',
  ADD COLUMN source3_employer TEXT NOT NULL DEFAULT '';