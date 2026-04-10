ALTER TABLE public.properties
ADD COLUMN apify_rent_input jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN apify_sale_input jsonb NOT NULL DEFAULT '{}'::jsonb;