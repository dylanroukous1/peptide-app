-- Supplide Distributor Pricing, pricing dated September 13, 2026.
-- The source PDF has 86 numbered rows and 85 unique product names.
-- Rows 23 and 24 both contain IGF-1 LR3-1mg at $15.00, so it appears once here.

create temporary table _supplide_pricing_20260918 (
  name text primary key,
  distributor_price numeric(12,2) not null check (distributor_price > 0)
) on commit drop;

insert into _supplide_pricing_20260918 (name, distributor_price)
values
  ('AOD-9604 5mg', 9.00),
  ('AOD-9604 10mg', 10.00),
  ('BPC-157 5mg', 7.00),
  ('BPC-157 10mg', 8.00),
  ('BPC-157 15mg', 9.00),
  ('BPC-157 20mg', 10.00),
  ('BPC-157 25mg', 12.00),
  ('BPC-157 30mg', 13.00),
  ('Cagrilintide 10mg', 18.00),
  ('CJC-1295 no-DAC 5mg', 10.00),
  ('CJC-1295 no-DAC 10mg', 14.00),
  ('CJC-Ipamorelin-5-5mg', 11.00),
  ('CJC-Ipamorelin-10-10mg', 13.00),
  ('Dihexa 10mg', 7.00),
  ('DSIP 10mg', 8.00),
  ('DSIP-5mg', 7.00),
  ('Epithalon 10mg', 9.00),
  ('GHK-Cu 50mg', 6.00),
  ('GHK-Cu 100mg', 7.00),
  ('GHRP-2 10mg', 9.00),
  ('GHRP-6 10mg', 9.00),
  ('GLOW 50/10/10 (GHK-Cu | TB-500 | BPC-157)', 15.00),
  ('IGF-1 LR3-1mg', 15.00),
  ('Ipamorelin 5mg', 9.00),
  ('Ipamorelin 10mg', 8.00),
  ('Kisspeptin-10-5mg', 9.00),
  ('KLOW (KPV | GHK-Cu | TB-500 | BPC-157)', 20.00),
  ('KPV 5mg', 7.00),
  ('KPV 10mg', 8.00),
  ('KPV 15mg', 12.00),
  ('LL-37 5mg', 10.00),
  ('Melanotan 1-10mg', 10.00),
  ('Melanotan 2-10mg', 10.00),
  ('MOTS-c 5mg', 7.00),
  ('MOTS-c 10mg', 8.00),
  ('MOTS-c 30mg', 17.00),
  ('MOTS-c 40mg', 20.00),
  ('MOTS-c 50mg', 21.00),
  ('NAD+ (buffered) 500 mg', 9.00),
  ('NAD+ (buffered) 1000mg', 11.00),
  ('Pinealon 20mg', 12.00),
  ('PT-141 10mg', 11.00),
  ('Retatrutide (GLP-3R) 10mg', 9.50),
  ('Retatrutide (GLP-3R) 12mg', 10.00),
  ('Retatrutide (GLP-3R) 20mg', 14.00),
  ('Retatrutide (GLP-3R) 30mg', 15.00),
  ('Retatrutide (GLP-3R) 40mg', 16.00),
  ('Retatrutide (GLP-3R) 50mg', 17.00),
  ('Retatrutide (GLP-3R) 60mg', 18.00),
  ('Retatrutide (GLP-3R) 100mg', 22.00),
  ('Selank 10mg', 8.00),
  ('Semaglutide 10mg', 7.00),
  ('Semaglutide 20mg', 10.00),
  ('Semaglutide 30mg', 11.00),
  ('Semaglutide 40mg', 12.50),
  ('Semaglutide 50mg', 14.00),
  ('Semax 10mg', 9.00),
  ('Semax/Selank Blend 10/10mg', 12.00),
  ('Sermorelin 2mg', 9.00),
  ('Sermorelin 5mg', 10.00),
  ('Sermorelin 10mg', 13.00),
  ('SNAP-8 10mg (Acetyl Octapeptide-3)', 8.00),
  ('SS-31 30mg', 11.00),
  ('SS-31 50mg', 14.00),
  ('SS-31-10mg', 9.00),
  ('TB4 5mg', 11.00),
  ('TB4 10mg', 12.00),
  ('TB4 20mg', 16.00),
  ('TB4 30mg', 20.00),
  ('Tesamorelin 5mg', 15.00),
  ('Tesamorelin 10mg', 18.00),
  ('Tesamorelin 30mg', 20.00),
  ('Tesamorelin - Ipamorelin 10-5mg', 13.00),
  ('thymosin alpha-1 (TA-1)-10mg', 17.00),
  ('Thymosin Beta 4', 13.00),
  ('Tirzeptide 10mg', 8.00),
  ('Tirzeptide 30mg', 13.00),
  ('Tirzeptide 60mg', 15.00),
  ('Tirzeptide 100mg - (5ML Vial)', 18.00),
  ('Tirzeptide 120mg - (5ML Vial)', 21.00),
  ('Tirzeptide 140mg - (5ML Vial)', 23.00),
  ('VIP 10mg', 11.00),
  ('Wolverine 5/5 TB-500 | BPC-157)', 11.00),
  ('Wolverine 10/10 (TB-500 | BPC-157)', 16.00),
  ('Wolverine 10/15 (TB-500 | BPC-157)', 12.00);

insert into public.peptides (name, default_unit_price, is_active)
select name, distributor_price, true
from _supplide_pricing_20260918
on conflict (name) do update
set
  default_unit_price = excluded.default_unit_price,
  is_active = true;

-- Fail the migration if the source list or persisted catalog does not match the PDF.
do $$
declare
  source_count integer;
  source_unique_count integer;
  matched_active_count integer;
begin
  select count(*), count(distinct name)
  into source_count, source_unique_count
  from _supplide_pricing_20260918;

  if source_count <> 85 or source_unique_count <> 85 then
    raise exception 'Supplide pricing verification failed: expected 85 unique source products, got % rows / % unique names',
      source_count, source_unique_count;
  end if;

  select count(*)
  into matched_active_count
  from _supplide_pricing_20260918 source
  join public.peptides peptide
    on peptide.name = source.name
   and peptide.default_unit_price = source.distributor_price
   and peptide.is_active = true;

  if matched_active_count <> 85 then
    raise exception 'Supplide pricing verification failed: expected 85 active, price-matched products, got %',
      matched_active_count;
  end if;

  if not exists (
    select 1 from public.peptides
    where name = 'BPC-157 10mg' and default_unit_price = 8.00 and is_active = true
  ) or not exists (
    select 1 from public.peptides
    where name = 'Retatrutide (GLP-3R) 10mg' and default_unit_price = 9.50 and is_active = true
  ) or not exists (
    select 1 from public.peptides
    where name = 'Semaglutide 40mg' and default_unit_price = 12.50 and is_active = true
  ) or not exists (
    select 1 from public.peptides
    where name = 'Wolverine 10/15 (TB-500 | BPC-157)' and default_unit_price = 12.00 and is_active = true
  ) then
    raise exception 'Supplide pricing verification failed for representative products';
  end if;
end
$$;
