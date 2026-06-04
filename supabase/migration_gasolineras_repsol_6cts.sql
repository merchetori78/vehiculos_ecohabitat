-- Columnas ampliadas para red contractual Repsol 6 cts/l.
-- La app no muestra precios para evitar equívocos por fluctuaciones.

alter table public.gasolineras
add column if not exists codigo_solred text,
add column if not exists descuento_texto text,
add column if not exists combustibles_descuento text,
add column if not exists comunidad_autonoma text,
add column if not exists codigo_postal text,
add column if not exists margen text,
add column if not exists horario text,
add column if not exists productos text,
add column if not exists servicios text;

-- Comprobaciones recomendadas tras importar el CSV de Repsol:
select count(*) as total from public.gasolineras;
select count(*) as con_mapa from public.gasolineras where latitud is not null and longitud is not null;
select combustibles_descuento, count(*) as estaciones from public.gasolineras group by combustibles_descuento order by estaciones desc;
