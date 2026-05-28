-- Eco Habitat · Control de vehículos
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role text not null default 'empleado' check (role in ('admin','flota','jefe_obra','empleado','lectura')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_work_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, work_name)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  brand text,
  model text,
  vehicle_name text,
  vehicle_type text default 'renting',
  provider text,
  customer text,
  contract_line text,
  accessories text,
  km_year text,
  lease_start date,
  lease_end date,
  monthly_amount numeric(12,2),
  status text not null default 'activo' check (status in ('activo','en revisión','baja','sustituido','pendiente entrega')),
  current_driver_name text,
  current_driver_user_id uuid references public.profiles(id),
  primary_work_name text,
  v16 boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solred_cards (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  card_number text not null unique,
  fuel_type text,
  machinery_associated boolean,
  active boolean not null default true,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_user_id uuid references public.profiles(id),
  driver_name text,
  work_name text,
  start_date date not null default current_date,
  end_date date,
  km_start numeric,
  km_end numeric,
  delivery_status text,
  return_status text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_km (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid references public.profiles(id),
  month date not null,
  km_start numeric not null,
  km_end numeric not null,
  km_total numeric generated always as (km_end - km_start) stored,
  odometer_photo_path text,
  notes text,
  validated_by uuid references public.profiles(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(vehicle_id, month)
);

create table if not exists public.km_work_allocations (
  id uuid primary key default gen_random_uuid(),
  monthly_km_id uuid not null references public.monthly_km(id) on delete cascade,
  work_name text not null,
  km_allocated numeric not null check (km_allocated >= 0)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id uuid references public.profiles(id),
  work_name text,
  incident_date date not null default current_date,
  type text not null,
  severity text not null default 'leve' check (severity in ('leve','media','grave')),
  description text not null,
  status text not null default 'abierta' check (status in ('abierta','en revisión','pendiente taller','pendiente proveedor','cerrada','rechazada')),
  blocks_vehicle boolean not null default false,
  responsible_name text,
  corrective_action text,
  preventive_action text,
  cost numeric(12,2),
  closed_at timestamptz,
  validated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete cascade,
  storage_path text not null,
  file_name text,
  file_type text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();

drop trigger if exists incidents_updated_at on public.incidents;
create trigger incidents_updated_at before update on public.incidents for each row execute function public.set_updated_at();

create or replace view public.report_monthly_km_by_work as
select
  mk.month,
  v.plate,
  v.brand,
  v.model,
  coalesce(kwa.work_name, v.primary_work_name, 'Sin obra') as work_name,
  coalesce(kwa.km_allocated, mk.km_total) as km_allocated,
  mk.km_start,
  mk.km_end,
  mk.km_total
from public.monthly_km mk
join public.vehicles v on v.id = mk.vehicle_id
left join public.km_work_allocations kwa on kwa.monthly_km_id = mk.id;
