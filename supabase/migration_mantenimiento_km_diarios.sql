-- Eco Habitat · Mantenimiento preventivo, propiedad/renting y kilómetros diarios
-- Ejecutar en Supabase SQL Editor antes de subir el código a producción.

-- 1) Nuevos campos en vehículos
alter table public.vehicles
add column if not exists ownership_type text default 'propio',
add column if not exists owner_company text,
add column if not exists renting_company text,
add column if not exists renting_contract_number text,
add column if not exists renting_start_date date,
add column if not exists renting_end_date date,
add column if not exists renting_monthly_cost numeric,
add column if not exists insurance_company text,
add column if not exists insurance_policy text,
add column if not exists itv_last_date date,
add column if not exists itv_next_date date,
add column if not exists itv_notes text,
add column if not exists current_km integer,
add column if not exists oil_last_km integer,
add column if not exists oil_interval_km integer,
add column if not exists tyres_last_km integer,
add column if not exists tyres_interval_km integer,
add column if not exists maintenance_notes text;

-- 2) Validaciones sencillas
alter table public.vehicles
  drop constraint if exists vehicles_ownership_type_check;

alter table public.vehicles
  add constraint vehicles_ownership_type_check
  check (ownership_type in ('propio', 'renting'));

-- 3) Kilómetros diarios
create table if not exists public.daily_km (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_name text,
  work_name text,
  date date not null default current_date,
  km_start integer not null,
  km_end integer not null,
  km_total integer generated always as (km_end - km_start) stored,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint daily_km_valid_km check (km_end >= km_start)
);

create index if not exists idx_daily_km_vehicle_date
on public.daily_km (vehicle_id, date desc);

create index if not exists idx_daily_km_created_by
on public.daily_km (created_by);

-- 4) Trigger updated_at para daily_km, si existe la función general
create or replace function public.set_daily_km_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists daily_km_updated_at on public.daily_km;
create trigger daily_km_updated_at
before update on public.daily_km
for each row execute function public.set_daily_km_updated_at();

-- 5) Seguridad RLS
alter table public.daily_km enable row level security;

drop policy if exists daily_km_read_by_vehicle on public.daily_km;
drop policy if exists daily_km_insert_allowed on public.daily_km;
drop policy if exists daily_km_update_manager on public.daily_km;

create policy daily_km_read_by_vehicle
on public.daily_km
for select
to authenticated
using (
  exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and public.can_access_vehicle(v)
  )
);

create policy daily_km_insert_allowed
on public.daily_km
for insert
to authenticated
with check (
  auth.uid() is not null
  and exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id
      and public.can_access_vehicle(v)
  )
);

create policy daily_km_update_manager
on public.daily_km
for update
to authenticated
using (public.current_role() in ('admin','flota','jefe_obra'))
with check (public.current_role() in ('admin','flota','jefe_obra'));

-- 6) Informe mensual basado en kilómetros diarios.
-- Mantiene el mismo nombre de vista que usa la pestaña Informes.
create or replace view public.report_monthly_km_by_work as
select
  date_trunc('month', dk.date)::date as month,
  v.plate,
  v.brand,
  v.model,
  v.vehicle_name,
  coalesce(dk.work_name, v.primary_work_name, 'Sin obra') as work_name,
  sum(dk.km_total)::numeric as km_allocated,
  min(dk.km_start)::numeric as km_start,
  max(dk.km_end)::numeric as km_end,
  sum(dk.km_total)::numeric as km_total,
  null::text as notes
from public.daily_km dk
join public.vehicles v on v.id = dk.vehicle_id
group by
  date_trunc('month', dk.date)::date,
  v.plate,
  v.brand,
  v.model,
  v.vehicle_name,
  coalesce(dk.work_name, v.primary_work_name, 'Sin obra');

-- 7) Comprobaciones rápidas
select count(*) as vehiculos from public.vehicles;
select count(*) as registros_km_diarios from public.daily_km;
