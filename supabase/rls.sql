-- Seguridad por filas. Ejecutar después de schema.sql.

alter table public.profiles enable row level security;
alter table public.user_work_permissions enable row level security;
alter table public.vehicles enable row level security;
alter table public.solred_cards enable row level security;
alter table public.vehicle_assignments enable row level security;
alter table public.monthly_km enable row level security;
alter table public.km_work_allocations enable row level security;
alter table public.incidents enable row level security;
alter table public.files enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_flota()
returns boolean language sql stable security definer as $$
  select public.current_role() in ('admin','flota');
$$;

create or replace function public.can_access_vehicle(v public.vehicles)
returns boolean language sql stable security definer as $$
  select
    public.current_role() in ('admin','flota','lectura')
    or v.current_driver_user_id = auth.uid()
    or exists (
      select 1 from public.vehicle_assignments a
      where a.vehicle_id = v.id
        and a.end_date is null
        and a.driver_user_id = auth.uid()
    )
    or (
      public.current_role() = 'jefe_obra'
      and exists (
        select 1 from public.user_work_permissions uwp
        where uwp.user_id = auth.uid()
          and lower(coalesce(v.primary_work_name,'')) like '%' || lower(uwp.work_name) || '%'
      )
    )
    or (
      public.current_role() = 'jefe_obra'
      and exists (
        select 1 from public.vehicle_assignments a
        join public.user_work_permissions uwp on uwp.user_id = auth.uid()
        where a.vehicle_id = v.id
          and a.end_date is null
          and lower(coalesce(a.work_name,'')) like '%' || lower(uwp.work_name) || '%'
      )
    );
$$;

create policy profiles_read_own_or_admin on public.profiles for select using (id = auth.uid() or public.is_admin_or_flota());
create policy profiles_update_admin on public.profiles for update using (public.is_admin_or_flota());
create policy profiles_insert_admin on public.profiles for insert with check (public.is_admin_or_flota());

create policy work_permissions_admin_read on public.user_work_permissions for select using (public.is_admin_or_flota() or user_id = auth.uid());
create policy work_permissions_admin_write on public.user_work_permissions for all using (public.is_admin_or_flota()) with check (public.is_admin_or_flota());

create policy vehicles_read_allowed on public.vehicles for select using (public.can_access_vehicle(vehicles));
create policy vehicles_insert_manager on public.vehicles for insert with check (public.current_role() in ('admin','flota','jefe_obra'));
create policy vehicles_update_manager on public.vehicles for update using (public.current_role() in ('admin','flota','jefe_obra'));

create policy solred_read_by_vehicle on public.solred_cards for select using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)));
create policy solred_write_manager on public.solred_cards for all using (public.is_admin_or_flota()) with check (public.is_admin_or_flota());

create policy assignments_read_by_vehicle on public.vehicle_assignments for select using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)));
create policy assignments_write_manager on public.vehicle_assignments for all using (public.current_role() in ('admin','flota','jefe_obra')) with check (public.current_role() in ('admin','flota','jefe_obra'));

create policy monthly_km_read_by_vehicle on public.monthly_km for select using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)));
create policy monthly_km_insert_allowed on public.monthly_km for insert with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)));
create policy monthly_km_update_manager on public.monthly_km for update using (public.current_role() in ('admin','flota','jefe_obra'));

create policy km_alloc_read on public.km_work_allocations for select using (exists (select 1 from public.monthly_km mk join public.vehicles v on v.id = mk.vehicle_id where mk.id = monthly_km_id and public.can_access_vehicle(v)));
create policy km_alloc_insert on public.km_work_allocations for insert with check (exists (select 1 from public.monthly_km mk join public.vehicles v on v.id = mk.vehicle_id where mk.id = monthly_km_id and public.can_access_vehicle(v)));

create policy incidents_read_by_vehicle on public.incidents for select using (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)));
create policy incidents_insert_allowed on public.incidents for insert with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)));
create policy incidents_update_manager on public.incidents for update using (public.current_role() in ('admin','flota','jefe_obra'));

create policy files_read_by_related on public.files for select using (
  (vehicle_id is not null and exists (select 1 from public.vehicles v where v.id = vehicle_id and public.can_access_vehicle(v)))
  or (incident_id is not null and exists (select 1 from public.incidents i join public.vehicles v on v.id = i.vehicle_id where i.id = incident_id and public.can_access_vehicle(v)))
);
create policy files_insert_authenticated on public.files for insert with check (auth.uid() is not null);

create policy audit_read_admin on public.audit_logs for select using (public.is_admin_or_flota());

-- Crear bucket en Supabase Storage llamado: evidencias
-- Hacerlo privado. Después añadir políticas Storage desde el panel si se necesita descarga directa.
