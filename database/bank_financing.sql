-- Bank financing on units (run once in the Supabase SQL editor).
-- bank_financing_amount: the loan amount (usually TCP - Downpayment).
-- bank_financing_terms: up to 4 options, e.g. [{"years":25,"rate":7.5},{"years":15,"rate":7}].
-- Monthly amortization and total interest are NOT stored; the pages compute them from these values.
alter table units add column if not exists bank_financing_amount numeric;
alter table units add column if not exists bank_financing_terms jsonb;
