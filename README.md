# Eco Habitat · Control de Vehículos

Aplicación móvil PWA para gestión de vehículos de empresa, tarjetas SOLRED, kilómetros mensuales, imputación por obras e incidencias con evidencias fotográficas.

## Qué incluye esta primera versión

- App móvil instalable desde navegador.
- Login con Supabase Auth.
- Roles: administrador, responsable de flota/ISO, jefe de obra, empleado y solo lectura.
- Vehículos: alta, modificación y baja lógica.
- SOLRED: tarjeta asociada a vehículo.
- Kilómetros mensuales obligatorios por vehículo.
- Imputación de kilómetros a varias obras.
- Incidencias con fotografía desde la cámara del móvil.
- Esquema SQL con trazabilidad para ISO 9001/14001.
- Script de importación desde la hoja Excel.

## Paso 1 · Crear el repositorio en GitHub

1. Entrar en GitHub.
2. Crear un repositorio nuevo, por ejemplo `ecohabitat-flota`.
3. Subir todos los archivos de esta carpeta.

Desde ordenador también se puede hacer con:

```bash
git init
git add .
git commit -m "Primera versión app flota Eco Habitat"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/ecohabitat-flota.git
git push -u origin main
```

## Paso 2 · Crear proyecto en Supabase

1. Entrar en Supabase.
2. Crear un proyecto nuevo.
3. Ir a SQL Editor.
4. Ejecutar `supabase/schema.sql`.
5. Ejecutar `supabase/rls.sql`.
6. Ir a Storage y crear un bucket privado llamado `evidencias`.

## Paso 3 · Configurar variables

Copiar `.env.example` como `.env` y rellenar:

```bash
cp .env.example .env
```

En Supabase, las claves están en Project Settings > API.

- `VITE_SUPABASE_URL`: URL del proyecto.
- `VITE_SUPABASE_ANON_KEY`: anon public key.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key. Solo para importar Excel, no subir nunca a GitHub.

## Paso 4 · Instalar y probar en local

```bash
npm install
npm run dev
```

Abrir la URL que indique Vite.

## Paso 5 · Crear usuarios

En Supabase > Authentication > Users, crear usuarios con email y contraseña.

Después, en SQL Editor, crear su perfil:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Nombre Apellidos', 'empleado'
from auth.users
where email = 'correo@empresa.com';
```

Roles permitidos:

- `admin`
- `flota`
- `jefe_obra`
- `empleado`
- `lectura`

Para que un empleado vea solo su vehículo, asignar su usuario en `vehicles.current_driver_user_id` o en `vehicle_assignments.driver_user_id`.

Para que un jefe vea los vehículos de sus obras:

```sql
insert into public.user_work_permissions (user_id, work_name)
values ('UUID_DEL_USUARIO', 'Nombre de obra');
```

## Paso 6 · Importar la hoja Excel

La hoja está en `sample-data/flota_solred.xlsx`.

Ejecutar:

```bash
npm run import:excel
```

El script importa:

- Vehículos de las hojas de renting/propios si existen.
- Tarjetas SOLRED de la hoja `Solred`.

## Paso 7 · Publicar la app

Recomendado: Vercel o Netlify.

En Vercel:

1. Conectar GitHub.
2. Seleccionar el repositorio.
3. Añadir variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

No añadir `SUPABASE_SERVICE_ROLE_KEY` a Vercel salvo que se vaya a crear una función de servidor protegida. Para esta primera versión solo se usa localmente al importar.

## Próximas mejoras recomendadas

- Panel de administración de usuarios.
- Botón de exportación PDF/Excel.
- Aviso automático mensual de kilómetros pendientes.
- Validación de kilómetros por responsable.
- Informes por auditoría ISO.
- Histórico visual de incidencias por vehículo.
