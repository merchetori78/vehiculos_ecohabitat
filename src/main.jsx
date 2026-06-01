import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

const ROLES = {
  admin: 'Administrador',
  flota: 'Responsable flota/ISO',
  jefe_obra: 'Jefe de obra',
  empleado: 'Empleado',
  lectura: 'Solo lectura'
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) { setProfile(null); return }
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (error && error.code !== 'PGRST116') console.error(error)
      setProfile(data || { id: session.user.id, email: session.user.email, role: 'empleado', full_name: session.user.email })
    }
    loadProfile()
  }, [session])

  if (loading) return <Shell><p>Cargando…</p></Shell>
  if (!session) return <Login />

  return (
    <Shell profile={profile}>
      <nav className="tabs">
        {[
  'inicio',
  'vehiculos',
  'asignaciones',
  'kilometros',
  'incidencias',
  'gasolineras',
  ...(canSeeReports(profile) ? ['informes'] : [])
].map(t => (
          <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{label(t)}</button>
        ))}
      </nav>
      {tab === 'inicio' && <Dashboard profile={profile} />}
      {tab === 'vehiculos' && <Vehicles profile={profile} />}
{tab === 'asignaciones' && <Assignments profile={profile} />}
      {tab === 'kilometros' && <KmForm profile={profile} />}
      {tab === 'incidencias' && <IncidentsPage profile={profile} />}
      {tab === 'gasolineras' && <GasolinerasPage profile={profile} />}
      {tab === 'informes' && canSeeReports(profile) && <Reports profile={profile} />}
    </Shell>
  )
}

function label(t){return {inicio:'Inicio',vehiculos:'Vehículos',asignaciones:'Asignaciones',kilometros:'Km',incidencias:'Incidencias',gasolineras:'Gasolineras',informes:'Informes'}[t]}

function Shell({ children, profile }) {
  return <div className="app">
    <header>
      <img src="/logo.jpg"/>
      <div>
        <h1>Control de Vehículos</h1>
        <small>{profile ? `${profile.full_name || profile.email} · ${ROLES[profile.role] || profile.role}` : 'Eco Habitat'}</small>
        {profile && (
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.reload()
            }}
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
    {children}
  </div>
}
function Login() {
  const [email, setEmail] = useState('')
const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  async function signIn(e){
    e.preventDefault(); setMessage('Entrando…')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? error.message : '')
  }
  return <Shell><form className="card" onSubmit={signIn}><h2>Entrar</h2><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label>
  Contraseña
  <div className="password-field">
    <input
      value={password}
      onChange={e => setPassword(e.target.value)}
      type={showPassword ? 'text' : 'password'}
      required
    />
    <button
      type="button"
      className="password-toggle"
      onClick={() => setShowPassword(v => !v)}
      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {showPassword ? '🙈' : '👁️'}
    </button>
  </div>
</label><button>Entrar</button><p className="muted">Acceso exclusivo para personal autorizado de Eco Habitat.</p>{message && <p>{message}</p>}</form></Shell>
}

function Dashboard({ profile }) {
  const [stats, setStats] = useState({ vehicles: 0, incidents: 0, pendingKm: 0 })
  useEffect(() => { (async()=>{
    const [{ count: vehicles }, { count: incidents }] = await Promise.all([
      supabase.from('vehicles').select('*', { count:'exact', head:true }).eq('status','activo'),
      supabase.from('incidents').select('*', { count:'exact', head:true }).neq('status','cerrada')
    ])
    setStats(s => ({...s, vehicles: vehicles||0, incidents: incidents||0}))
  })() }, [])
  return <section className="grid"><div className="card kpi"><b>{stats.vehicles}</b><span>Vehículos visibles activos</span></div><div className="card kpi"><b>{stats.incidents}</b><span>Incidencias abiertas</span></div><div className="card"><h2>Regla de uso</h2><p>Empleado: solo su vehículo. Jefe de obra: vehículos de sus obras. Administración/flota: todos.</p></div><div className="card"><h2>ISO 9001/14001</h2><p>Se conservan altas, bajas, modificaciones, kilómetros, incidencias, acciones correctivas y evidencias fotográficas.</p></div></section>
}

function Vehicles({ profile }) {
  const [vehicles, setVehicles] = useState([])
  const [selected, setSelected] = useState(null)
  const [statusFilter, setStatusFilter] = useState('activo')

  useEffect(() => { load() }, [statusFilter])

  async function load(){
    let query = supabase
      .from('vehicles')
      .select('*, solred_cards(card_number,fuel_type,active), vehicle_assignments(driver_name,work_name,start_date,end_date)')
      .order('plate')

    if (statusFilter !== 'todos') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) console.error(error)
    setVehicles(data || [])
  }

  return (
    <section>
      <div className="toolbar">
        <h2>Vehículos</h2>

        <div className="inline">
          <button
            type="button"
            className={statusFilter === 'activo' ? 'active' : 'secondary'}
            onClick={() => setStatusFilter('activo')}
          >
            Activos
          </button>

          <button
            type="button"
            className={statusFilter === 'baja' ? 'active' : 'secondary'}
            onClick={() => setStatusFilter('baja')}
          >
            Bajas
          </button>

          <button
            type="button"
            className={statusFilter === 'todos' ? 'active' : 'secondary'}
            onClick={() => setStatusFilter('todos')}
          >
            Todos
          </button>
        </div>

        {canEdit(profile) && (
          <button
            onClick={() => {
              setSelected({ status: 'activo' })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            Nuevo
          </button>
        )}
      </div>

      {selected && (
        <VehicleEditor
          vehicle={selected}
          onDone={() => {
            setSelected(null)
            load()
          }}
        />
      )}

      <div className="list">
        {vehicles.map(v => (
          <article className="card" key={v.id}>
            <h3>{v.plate} · {v.brand} {v.model}</h3>
            <p>{v.current_driver_name || 'Sin conductor'} · {v.primary_work_name || 'Sin obra'} · {v.status}</p>
            <p>Solred: {v.solred_cards?.[0]?.card_number || 'sin tarjeta'}</p>

            {canEdit(profile) && (
              <button
                onClick={() => {
                  setSelected(v)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                Modificar
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
function Assignments({ profile }) {
  const [vehicles, setVehicles] = useState([])
  const [profiles, setProfiles] = useState([])
  const [assignments, setAssignments] = useState([])
  const [form, setForm] = useState({
    vehicle_id: '',
    driver_user_id: '',
    driver_name: '',
    work_name: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    notes: ''
  })

  useEffect(() => {
    load()
  }, [])

  function patch(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function load() {
    const { data: vehicleData, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id,plate,brand,model,current_driver_name,primary_work_name,status')
      .eq('status', 'activo')
      .order('plate')

    if (vehicleError) alert(vehicleError.message)
    else setVehicles(vehicleData || [])

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,active')
      .eq('active', true)
      .order('full_name')

    if (profileError) alert(profileError.message)
    else setProfiles(profileData || [])

    const { data: assignmentData, error: assignmentError } = await supabase
      .from('vehicle_assignments')
      .select('*, vehicles(plate,brand,model)')
      .order('start_date', { ascending: false })

    if (assignmentError) alert(assignmentError.message)
    else setAssignments(assignmentData || [])
  }

  async function save(e) {
    e.preventDefault()

    const payload = {
      vehicle_id: form.vehicle_id,
      driver_user_id: form.driver_user_id || null,
      driver_name: form.driver_name,
      work_name: form.work_name,
      start_date: form.start_date,
      end_date: form.end_date || null
    }

    const { error } = await supabase
      .from('vehicle_assignments')
      .insert(payload)

    if (error) {
      alert(error.message)
      return
    }

    const today = new Date().toISOString().slice(0, 10)

    if (!form.end_date || form.end_date >= today) {
      await supabase
        .from('vehicles')
        .update({
          current_driver_name: form.driver_name,
          primary_work_name: form.work_name
        })
        .eq('id', form.vehicle_id)
    }

    alert('Asignación registrada')

    setForm({
      vehicle_id: '',
      driver_user_id: '',
      driver_name: '',
      work_name: '',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      notes: ''
    })

    load()
  }

  function onDriverChange(value) {
    const user = profiles.find(p => p.id === value)

    patch('driver_user_id', value)

    if (user) {
      patch('driver_name', user.full_name || user.email)
    }
  }

  if (!canEdit(profile)) {
    return (
      <section className="card">
        <h2>Asignaciones</h2>
        <p>No tienes permisos para gestionar asignaciones.</p>
      </section>
    )
  }

  return (
    <section>
      <form className="card" onSubmit={save}>
        <h2>Nueva asignación</h2>
        <p className="muted">
          Usa este formulario cuando un vehículo cambie de conductor, de obra o ambos.
          Si hay un cambio dentro del mismo mes, registra una asignación para cada periodo.
        </p>

        <label>
          Vehículo
          <select
            required
            value={form.vehicle_id}
            onChange={e => patch('vehicle_id', e.target.value)}
          >
            <option value="">Seleccionar</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.plate} · {v.brand} {v.model}
              </option>
            ))}
          </select>
        </label>

        <div className="formgrid">
          <label>
            Usuario conductor
            <select
              value={form.driver_user_id}
              onChange={e => onDriverChange(e.target.value)}
            >
              <option value="">Sin usuario vinculado</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email} · {p.role}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nombre conductor
            <input
              required
              value={form.driver_name}
              onChange={e => patch('driver_name', e.target.value)}
              placeholder="Nombre del conductor"
            />
          </label>

          <label>
            Obra
            <input
              required
              value={form.work_name}
              onChange={e => patch('work_name', e.target.value)}
              placeholder="Nombre de obra"
            />
          </label>
        </div>

        <div className="formgrid">
          <label>
            Fecha inicio
            <input
              type="date"
              required
              value={form.start_date}
              onChange={e => patch('start_date', e.target.value)}
            />
          </label>

          <label>
            Fecha fin
            <input
              type="date"
              value={form.end_date}
              onChange={e => patch('end_date', e.target.value)}
            />
          </label>
        </div>

        <button>Guardar asignación</button>
      </form>

      <section className="card">
        <h2>Histórico de asignaciones</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Conductor</th>
                <th>Obra</th>
                <th>Inicio</th>
                <th>Fin</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td>{a.vehicles?.plate || ''} · {a.vehicles?.brand || ''} {a.vehicles?.model || ''}</td>
                  <td>{a.driver_name || ''}</td>
                  <td>{a.work_name || ''}</td>
                  <td>{a.start_date || ''}</td>
                  <td>{a.end_date || 'Actual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function VehicleEditor({ vehicle, onDone }) {
  const [form, setForm] = useState(vehicle)
  function set(k,v){setForm(f=>({...f,[k]:v}))}
  async function save(e){
    e.preventDefault()
    const payload = { plate: form.plate, brand: form.brand, model: form.model, provider: form.provider, contract_line: form.contract_line, current_driver_name: form.current_driver_name, primary_work_name: form.primary_work_name, status: form.status || 'activo', notes: form.notes }
    const res = form.id ? await supabase.from('vehicles').update(payload).eq('id', form.id) : await supabase.from('vehicles').insert(payload)
    if (res.error) alert(res.error.message); else onDone()
  }
  return <form className="card" onSubmit={save}><h3>{form.id?'Modificar vehículo':'Alta vehículo'}</h3><div className="formgrid"><label>Matrícula<input value={form.plate||''} onChange={e=>set('plate',e.target.value.toUpperCase())} required/></label><label>Marca<input value={form.brand||''} onChange={e=>set('brand',e.target.value)}/></label><label>Modelo<input value={form.model||''} onChange={e=>set('model',e.target.value)}/></label><label>Conductor<input value={form.current_driver_name||''} onChange={e=>set('current_driver_name',e.target.value)}/></label><label>Obra habitual<input value={form.primary_work_name||''} onChange={e=>set('primary_work_name',e.target.value)}/></label><label>Estado<select value={form.status||'activo'} onChange={e=>set('status',e.target.value)}><option>activo</option><option>en revisión</option><option>baja</option></select></label></div><label>Observaciones<textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></label><button>Guardar</button><button type="button" className="secondary" onClick={onDone}>Cancelar</button></form>
}

function KmForm({ profile }) {
  const [vehicles, setVehicles] = useState([]); const [form,setForm] = useState({ month: new Date().toISOString().slice(0,7), allocations:[{work_name:'',km_allocated:''}] })
  useEffect(()=>{supabase.from('vehicles').select('id,plate,brand,model,current_driver_name').eq('status','activo').then(({data})=>setVehicles(data||[]))},[])
  function patch(k,v){setForm(f=>({...f,[k]:v}))}
  async function save(e){
    e.preventDefault()
    const km = Number(form.km_end||0) - Number(form.km_start||0)
    const { data, error } = await supabase.from('monthly_km').insert({ vehicle_id: form.vehicle_id, month: form.month + '-01', km_start: form.km_start, km_end: form.km_end, notes: form.notes }).select().single()
    if (error) {
  if (error.message.includes('monthly_km_vehicle_id_month_key')) {
    return alert('Ya existe un registro de kilómetros para este vehículo y este mes. Revisa el registro existente antes de crear uno nuevo.')
  }

  return alert(error.message)
}
    const validAllocations = form.allocations.filter(a => a.work_name)
const rows = validAllocations.map((a) => {
  const allocatedKm = a.km_allocated
    ? Number(a.km_allocated)
    : validAllocations.length === 1
      ? km
      : 0

  return {
    monthly_km_id: data.id,
    work_name: a.work_name,
    km_allocated: allocatedKm
  }
})
    if (rows.length) await supabase.from('km_work_allocations').insert(rows)
    alert('Kilómetros guardados')
  }
  return <form className="card" onSubmit={save}><h2>Kilómetros mensuales</h2><label>Vehículo<select required value={form.vehicle_id||''} onChange={e=>patch('vehicle_id',e.target.value)}><option value="">Seleccionar</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</option>)}</select></label><div className="formgrid"><label>Mes<input type="month" value={form.month} onChange={e=>patch('month',e.target.value)} required/></label><label>Km iniciales<input type="number" value={form.km_start||''} onChange={e=>patch('km_start',e.target.value)} required/></label><label>Km finales<input type="number" value={form.km_end||''} onChange={e=>patch('km_end',e.target.value)} required/></label></div><h3>Imputación a obras</h3>{form.allocations.map((a,i)=><div className="inline" key={i}><input placeholder="Nombre de obra" value={a.work_name} onChange={e=>{const arr=[...form.allocations];arr[i].work_name=e.target.value;patch('allocations',arr)}}/><input type="number" placeholder="Km" value={a.km_allocated} onChange={e=>{const arr=[...form.allocations];arr[i].km_allocated=e.target.value;patch('allocations',arr)}}/></div>)}<button type="button" className="secondary" onClick={()=>patch('allocations',[...form.allocations,{work_name:'',km_allocated:''}])}>Añadir otra obra</button><label>Observaciones<textarea value={form.notes||''} onChange={e=>patch('notes',e.target.value)}/></label><button>Guardar kilómetros</button></form>
}

function IncidentForm({ profile, onSaved }) {
  const [vehicles,setVehicles]=useState([]); const [form,setForm]=useState({severity:'leve',status:'abierta'}); const [photo,setPhoto]=useState(null)
  useEffect(()=>{supabase.from('vehicles').select('id,plate,brand,model').eq('status','activo').then(({data})=>setVehicles(data||[]))},[])
  function patch(k,v){setForm(f=>({...f,[k]:v}))}
  async function save(e){
    e.preventDefault()
    const { data, error } = await supabase.from('incidents').insert(form).select().single()
    if (error) return alert(error.message)
    if (photo) {
  const path = `incidencias/${data.id}/${Date.now()}-${photo.name}`

  const up = await supabase.storage
    .from('vehiculos')
    .upload(path, photo)

  if (up.error) {
    alert('La incidencia se ha guardado, pero no se pudo subir la foto: ' + up.error.message)
  } else {
    const { error: fileError } = await supabase
      .from('files')
      .insert({
        incident_id: data.id,
        vehicle_id: form.vehicle_id,
        storage_path: path,
        file_name: photo.name,
        file_type: photo.type,
        uploaded_by: profile.id
      })

    if (fileError) {
      alert('La foto se ha subido, pero no se pudo registrar en la tabla files: ' + fileError.message)
    }
  }
}
    alert('Incidencia registrada')
setForm({severity:'leve',status:'abierta'})
setPhoto(null)
if (onSaved) onSaved()
  }
  return <form className="card" onSubmit={save}><h2>Nueva incidencia</h2><label>Vehículo<select required value={form.vehicle_id||''} onChange={e=>patch('vehicle_id',e.target.value)}><option value="">Seleccionar</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</option>)}</select></label><div className="formgrid"><label>Obra<input value={form.work_name||''} onChange={e=>patch('work_name',e.target.value)}/></label><label>Tipo<select value={form.type||''} onChange={e=>patch('type',e.target.value)} required><option value="">Seleccionar</option><option>Avería</option><option>Accidente</option><option>Daño exterior</option><option>Neumáticos</option><option>ITV</option><option>Documentación</option><option>Tarjeta SOLRED</option><option>Otra</option></select></label><label>Gravedad<select value={form.severity} onChange={e=>patch('severity',e.target.value)}><option>leve</option><option>media</option><option>grave</option></select></label></div><label>Descripción<textarea required value={form.description||''} onChange={e=>patch('description',e.target.value)}/></label><label>Foto<input type="file" accept="image/*" capture="environment" onChange={e=>setPhoto(e.target.files?.[0])}/></label><button>Registrar incidencia</button></form>
}

function IncidentsPage({ profile }) {
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <section>
      <IncidentForm
        profile={profile}
        onSaved={() => setReloadKey(k => k + 1)}
      />

      <IncidentList
        profile={profile}
        reloadKey={reloadKey}
      />
    </section>
  )
}

function IncidentList({ profile, reloadKey }) {
  const [incidents, setIncidents] = useState([])
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    load()
  }, [reloadKey])

  async function load() {
    const { data, error } = await supabase
      .from('incidents')
      .select('*, vehicles(plate, vehicle_name)')
      .order('incident_date', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setIncidents(data || [])
  }

  async function saveClose(e) {
    e.preventDefault()

    const payload = {
      status: editing.status,
      corrective_action: editing.corrective_action || null,
      corrective_responsible: editing.corrective_responsible || null,
      closed_at: editing.closed_at || null,
      closing_notes: editing.closing_notes || null
    }

    const { error } = await supabase
      .from('incidents')
      .update(payload)
      .eq('id', editing.id)

    if (error) {
      alert(error.message)
      return
    }

    alert('Incidencia actualizada')
    setEditing(null)
    load()
  }

  if (!canEdit(profile)) {
    return null
  }

  return (
    <section className="card">
      <h2>Gestión de incidencias</h2>
      <p className="muted">
        Desde aquí puedes revisar incidencias, registrar acciones correctivas y cerrar incidencias.
      </p>

      {editing && (
        <form className="card" onSubmit={saveClose}>
          <h3>Cerrar / actualizar incidencia</h3>

          <p>
            <b>{editing.vehicles?.plate || ''}</b> · {editing.type || ''} · {editing.description || ''}
          </p>

          <div className="formgrid">
            <label>
              Estado
              <select
                value={editing.status || 'abierta'}
                onChange={e => setEditing(i => ({ ...i, status: e.target.value }))}
              >
                <option value="abierta">abierta</option>
                <option value="en revisión">en revisión</option>
                <option value="cerrada">cerrada</option>
              </select>
            </label>

            <label>
              Fecha de cierre
              <input
                type="date"
                value={editing.closed_at || ''}
                onChange={e => setEditing(i => ({ ...i, closed_at: e.target.value }))}
              />
            </label>

            <label>
              Responsable
              <input
                value={editing.corrective_responsible || ''}
                onChange={e => setEditing(i => ({ ...i, corrective_responsible: e.target.value }))}
                placeholder="Responsable de cierre o seguimiento"
              />
            </label>
          </div>

          <label>
            Acción correctiva
            <textarea
              value={editing.corrective_action || ''}
              onChange={e => setEditing(i => ({ ...i, corrective_action: e.target.value }))}
              placeholder="Describe la acción correctiva aplicada"
            />
          </label>

          <label>
            Observaciones de cierre
            <textarea
              value={editing.closing_notes || ''}
              onChange={e => setEditing(i => ({ ...i, closing_notes: e.target.value }))}
              placeholder="Observaciones adicionales, comprobaciones, reparación, sustitución, etc."
            />
          </label>

          <button>Guardar cambios</button>
          <button type="button" className="secondary" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        </form>
      )}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Matrícula</th>
              <th>Vehículo</th>
              <th>Obra</th>
              <th>Tipo</th>
              <th>Gravedad</th>
              <th>Estado</th>
              <th>Descripción</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(i => (
              <tr key={i.id}>
                <td>{i.incident_date || ''}</td>
                <td>{i.vehicles?.plate || ''}</td>
                <td>{i.vehicles?.vehicle_name || ''}</td>
                <td>{i.work_name || ''}</td>
                <td>{i.type || ''}</td>
                <td>{i.severity || ''}</td>
                <td>{i.status || ''}</td>
                <td>{i.description || ''}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditing(i)}
                  >
                    Gestionar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}


function GasolinerasPage() {
  const [gasolineras, setGasolineras] = useState([])
  const [loadingGasolineras, setLoadingGasolineras] = useState(true)
  const [search, setSearch] = useState('')
  const [province, setProvince] = useState('')
  const [onlyHabituales, setOnlyHabituales] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [radiusKm, setRadiusKm] = useState('')
  const mapContainerRef = React.useRef(null)
  const mapRef = React.useRef(null)
  const markersLayerRef = React.useRef(null)

  useEffect(() => {
    loadGasolineras()
  }, [])

  useEffect(() => {
    renderMap()
  }, [gasolineras, search, province, onlyHabituales, userLocation, radiusKm])

  async function loadGasolineras() {
    setLoadingGasolineras(true)
    setErrorMessage('')

    let allGasolineras = []
    let from = 0
    const pageSize = 1000
    let keepLoading = true
    let error = null

    while (keepLoading) {
      const { data, error: batchError } = await supabase
        .from('gasolineras')
        .select('codigo,nombre,rotulo,direccion,municipio,provincia,latitud,longitud,descuento,es_habitual,habitual_nombre,google_maps_url,activa')
        .eq('activa', true)
        .order('provincia')
        .order('municipio')
        .order('nombre')
        .range(from, from + pageSize - 1)

      if (batchError) {
        error = batchError
        keepLoading = false
      } else {
        allGasolineras = [...allGasolineras, ...(data || [])]
        if (!data || data.length < pageSize) keepLoading = false
        else from += pageSize
      }
    }

    if (error) {
      console.error(error)
      setErrorMessage(error.message)
      setGasolineras([])
    } else {
      setGasolineras(allGasolineras)
    }

    setLoadingGasolineras(false)
  }

  function locateMe() {
    setLocationError('')

    if (!navigator.geolocation) {
      setLocationError('Este navegador no permite obtener la ubicación.')
      return
    }

    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      position => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        }
        setUserLocation(nextLocation)
        setLocationLoading(false)

        if (mapRef.current) {
          mapRef.current.setView([nextLocation.lat, nextLocation.lng], 12)
        }
      },
      error => {
        setLocationLoading(false)
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('No se ha podido usar tu ubicación porque el permiso está bloqueado o denegado.')
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError('No se ha podido obtener tu ubicación actual.')
        } else if (error.code === error.TIMEOUT) {
          setLocationError('La ubicación ha tardado demasiado en responder. Prueba otra vez.')
        } else {
          setLocationError(error.message || 'No se ha podido obtener tu ubicación.')
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    )
  }

  function clearLocation() {
    setUserLocation(null)
    setRadiusKm('')
    setLocationError('')
  }

  const filtered = gasolineras
    .map(g => {
      const distanceKm = userLocation && hasValidCoords(g)
        ? getDistanceKm(userLocation.lat, userLocation.lng, Number(g.latitud), Number(g.longitud))
        : null
      return { ...g, distanceKm }
    })
    .filter(g => {
      const text = `${g.nombre || ''} ${g.rotulo || ''} ${g.direccion || ''} ${g.municipio || ''} ${g.provincia || ''} ${g.habitual_nombre || ''}`.toLowerCase()
      const matchesSearch = !search || text.includes(search.toLowerCase())
      const matchesProvince = !province || g.provincia === province
      const matchesHabitual = !onlyHabituales || g.es_habitual
      const matchesRadius = !userLocation || !radiusKm || (g.distanceKm !== null && g.distanceKm <= Number(radiusKm))
      return matchesSearch && matchesProvince && matchesHabitual && matchesRadius
    })
    .sort((a, b) => {
      if (!userLocation) return 0
      if (a.distanceKm === null) return 1
      if (b.distanceKm === null) return -1
      return a.distanceKm - b.distanceKm
    })

  const withCoords = filtered.filter(hasValidCoords)
  const provinces = Array.from(new Set(gasolineras.map(g => g.provincia).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))

  async function ensureLeaflet() {
    if (window.L) return window.L

    await loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
    return window.L
  }

  async function renderMap() {
    if (!mapContainerRef.current) return
    const L = await ensureLeaflet()
    if (!mapContainerRef.current) return

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        scrollWheelZoom: false
      }).setView([40.2, -3.7], 6)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapRef.current)

      markersLayerRef.current = L.layerGroup().addTo(mapRef.current)
    }

    markersLayerRef.current.clearLayers()

    const bounds = []

    if (userLocation) {
      bounds.push([userLocation.lat, userLocation.lng])
      const userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 9,
        weight: 3,
        fillOpacity: 0.95
      })
      userMarker.bindPopup(`
        <strong>Tu ubicación aproximada</strong><br/>
        Precisión: ${Math.round(userLocation.accuracy || 0)} m
      `)
      userMarker.addTo(markersLayerRef.current)
    }

    withCoords.forEach(g => {
      const lat = Number(g.latitud)
      const lng = Number(g.longitud)
      bounds.push([lat, lng])

      const marker = L.circleMarker([lat, lng], {
        radius: g.es_habitual ? 8 : 5,
        weight: g.es_habitual ? 3 : 1,
        fillOpacity: g.es_habitual ? 0.9 : 0.65
      })

      marker.bindPopup(`
        <strong>${escapeHtml(g.nombre || 'Gasolinera')}</strong><br/>
        ${g.es_habitual ? '<b>Habitual Eco Habitat</b><br/>' : ''}
        ${g.distanceKm !== null ? `<b>A ${formatDistance(g.distanceKm)}</b><br/>` : ''}
        ${escapeHtml(g.direccion || '')}<br/>
        ${escapeHtml([g.municipio, g.provincia].filter(Boolean).join(', '))}<br/>
        Descuento: ${escapeHtml(g.descuento ?? '')}<br/>
        <a href="${g.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}" target="_blank" rel="noreferrer">Cómo llegar</a>
      `)

      marker.addTo(markersLayerRef.current)
    })

    if (bounds.length && !userLocation) {
      if (!province) {
        mapRef.current.setView([40.2, -3.7], 6)
      } else {
        mapRef.current.fitBounds(bounds, {
          padding: [24, 24],
          maxZoom: bounds.length === 1 ? 14 : 11
        })
      }
    }
  }

  function focusGasolinera(g) {
    const lat = Number(g.latitud)
    const lng = Number(g.longitud)
    if (!mapRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    mapRef.current.setView([lat, lng], 15)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section>
      <div className="toolbar">
        <h2>Gasolineras con descuento</h2>
        <button type="button" className="secondary" onClick={loadGasolineras}>Actualizar</button>
      </div>

      <div className="card">
        <p className="muted">
          Red de estaciones preferentes para repostar. Las gasolineras habituales aparecen destacadas en el mapa y en el listado.
        </p>

        <div className="location-toolbar">
          <button type="button" onClick={locateMe} disabled={locationLoading}>
            {locationLoading ? 'Buscando ubicación…' : '📍 Cerca de mí'}
          </button>

          {userLocation && (
            <>
              <label className="radius-label">
                Radio
                <select value={radiusKm} onChange={e => setRadiusKm(e.target.value)}>
                  <option value="">Sin límite</option>
                  <option value="5">5 km</option>
                  <option value="10">10 km</option>
                  <option value="25">25 km</option>
                  <option value="50">50 km</option>
                  <option value="100">100 km</option>
                </select>
              </label>
              <button type="button" className="secondary" onClick={clearLocation}>Quitar ubicación</button>
            </>
          )}
        </div>

        {userLocation && (
          <p className="muted">
            Ubicación activa. El listado se ordena por distancia y el mapa muestra tu posición aproximada.
          </p>
        )}
        {locationError && <p className="error">{locationError}</p>}

        <div className="formgrid">
          <label>
            Buscar
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, municipio, dirección…" />
          </label>

          <label>
            Provincia
            <select value={province} onChange={e => setProvince(e.target.value)}>
              <option value="">Todas</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <label className="checkbox-label">
            <input type="checkbox" checked={onlyHabituales} onChange={e => setOnlyHabituales(e.target.checked)} />
            Solo habituales
          </label>
        </div>

        <div className="gasolineras-stats">
          <span><b>{filtered.length}</b> estaciones</span>
          <span><b>{withCoords.length}</b> con mapa</span>
          <span><b>{filtered.filter(g => g.es_habitual).length}</b> habituales</span>
          {userLocation && <span><b>{withCoords.filter(g => g.distanceKm !== null).length}</b> con distancia</span>}
        </div>

        {loadingGasolineras && <p>Cargando gasolineras…</p>}
        {errorMessage && <p className="error">No se han podido cargar las gasolineras: {errorMessage}</p>}

        <div ref={mapContainerRef} className="map"></div>
      </div>

      <section className="card">
        <h3>Listado</h3>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Estación</th>
                <th>Municipio</th>
                <th>Provincia</th>
                {userLocation && <th>Distancia</th>}
                <th>Descuento</th>
                <th>Habitual</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map(g => (
                <tr key={g.codigo || `${g.nombre}-${g.latitud}-${g.longitud}`}>
                  <td>
                    <b>{g.nombre}</b><br />
                    <span className="muted">{g.direccion}</span>
                  </td>
                  <td>{g.municipio || ''}</td>
                  <td>{g.provincia || ''}</td>
                  {userLocation && <td>{g.distanceKm !== null ? formatDistance(g.distanceKm) : ''}</td>}
                  <td>{g.descuento || ''}</td>
                  <td>{g.es_habitual ? 'Sí' : ''}</td>
                  <td>
                    {hasValidCoords(g) && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => focusGasolinera(g)}
                      >
                        Ver mapa
                      </button>
                    )}
                    <a
                      className="button-link"
                      href={g.google_maps_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Cómo llegar
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
                {filtered.length > 300 && (
          <p className="muted">
            Mostrando las primeras 300 estaciones. Usa los filtros para afinar la búsqueda.
          </p>
        )}
      </section>
    </section>
  )
}

function hasValidCoords(g) {
  const lat = Number(g.latitud)
  const lng = Number(g.longitud)
  const provincia = String(g.provincia || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat === 0 ||
    lng === 0
  ) {
    return false
  }

  const provinceBounds = [
    { names: ['a coruna', 'la coruna'], minLat: 42.7, maxLat: 43.9, minLng: -9.4, maxLng: -7.6 },
    { names: ['alava', 'araba'], minLat: 42.4, maxLat: 43.3, minLng: -3.4, maxLng: -2.2 },
    { names: ['albacete'], minLat: 38.0, maxLat: 39.6, minLng: -3.0, maxLng: -1.0 },
    { names: ['alicante'], minLat: 37.7, maxLat: 38.9, minLng: -1.2, maxLng: 0.1 },
    { names: ['almeria'], minLat: 36.6, maxLat: 37.7, minLng: -3.2, maxLng: -1.5 },
    { names: ['asturias'], minLat: 42.8, maxLat: 43.8, minLng: -7.2, maxLng: -4.4 },
    { names: ['avila'], minLat: 40.0, maxLat: 41.3, minLng: -5.8, maxLng: -4.0 },
    { names: ['badajoz'], minLat: 37.8, maxLat: 39.6, minLng: -7.4, maxLng: -4.6 },
    { names: ['barcelona'], minLat: 41.1, maxLat: 42.4, minLng: 1.2, maxLng: 2.8 },
    { names: ['burgos'], minLat: 41.6, maxLat: 43.3, minLng: -4.4, maxLng: -2.5 },
    { names: ['caceres'], minLat: 39.0, maxLat: 40.6, minLng: -7.6, maxLng: -4.9 },
    { names: ['cadiz'], minLat: 35.9, maxLat: 37.1, minLng: -6.6, maxLng: -5.0 },
    { names: ['cantabria'], minLat: 42.7, maxLat: 43.6, minLng: -4.9, maxLng: -3.1 },
    { names: ['castellon', 'castello'], minLat: 39.6, maxLat: 40.9, minLng: -0.9, maxLng: 0.6 },
    { names: ['ciudad real'], minLat: 38.3, maxLat: 39.7, minLng: -5.4, maxLng: -2.6 },
    { names: ['cordoba'], minLat: 37.2, maxLat: 38.8, minLng: -5.4, maxLng: -3.8 },
    { names: ['cuenca'], minLat: 39.2, maxLat: 40.8, minLng: -3.5, maxLng: -1.0 },
    { names: ['girona', 'gerona'], minLat: 41.6, maxLat: 42.6, minLng: 1.6, maxLng: 3.4 },
    { names: ['granada'], minLat: 36.6, maxLat: 38.1, minLng: -4.0, maxLng: -2.0 },
    { names: ['guadalajara'], minLat: 40.1, maxLat: 41.4, minLng: -3.6, maxLng: -1.6 },
    { names: ['gipuzkoa', 'guipuzcoa'], minLat: 42.8, maxLat: 43.5, minLng: -2.8, maxLng: -1.6 },
    { names: ['huelva'], minLat: 36.7, maxLat: 38.3, minLng: -7.6, maxLng: -5.9 },
    { names: ['huesca'], minLat: 41.5, maxLat: 42.9, minLng: -0.9, maxLng: 0.8 },
    { names: ['illes balears', 'baleares'], minLat: 38.5, maxLat: 40.2, minLng: 1.1, maxLng: 4.4 },
    { names: ['jaen'], minLat: 37.4, maxLat: 38.6, minLng: -4.3, maxLng: -2.4 },
    { names: ['la rioja', 'rioja'], minLat: 41.8, maxLat: 42.7, minLng: -3.2, maxLng: -1.7 },
    { names: ['las palmas'], minLat: 27.6, maxLat: 29.5, minLng: -16.2, maxLng: -13.3 },
    { names: ['leon'], minLat: 42.1, maxLat: 43.3, minLng: -7.1, maxLng: -4.6 },
    { names: ['lleida', 'lerida'], minLat: 41.2, maxLat: 42.9, minLng: 0.2, maxLng: 1.9 },
    { names: ['lugo'], minLat: 42.4, maxLat: 43.8, minLng: -8.0, maxLng: -6.7 },
    { names: ['madrid'], minLat: 39.9, maxLat: 41.2, minLng: -4.6, maxLng: -3.0 },
    { names: ['malaga'], minLat: 36.3, maxLat: 37.4, minLng: -5.7, maxLng: -3.8 },
    { names: ['murcia'], minLat: 37.3, maxLat: 38.6, minLng: -2.5, maxLng: -0.6 },
    { names: ['navarra'], minLat: 41.8, maxLat: 43.3, minLng: -2.6, maxLng: -0.7 },
    { names: ['ourense', 'orense'], minLat: 41.8, maxLat: 42.6, minLng: -8.4, maxLng: -6.7 },
    { names: ['palencia'], minLat: 41.7, maxLat: 43.1, minLng: -5.1, maxLng: -3.8 },
    { names: ['pontevedra'], minLat: 41.8, maxLat: 42.9, minLng: -9.0, maxLng: -7.7 },
    { names: ['salamanca'], minLat: 40.2, maxLat: 41.4, minLng: -6.9, maxLng: -5.0 },
    { names: ['santa cruz', 'tenerife'], minLat: 27.5, maxLat: 29.5, minLng: -18.5, maxLng: -16.0 },
    { names: ['segovia'], minLat: 40.6, maxLat: 41.6, minLng: -4.8, maxLng: -3.2 },
    { names: ['sevilla'], minLat: 36.8, maxLat: 38.3, minLng: -6.6, maxLng: -4.6 },
    { names: ['soria'], minLat: 41.0, maxLat: 42.2, minLng: -3.2, maxLng: -1.6 },
    { names: ['tarragona'], minLat: 40.4, maxLat: 41.6, minLng: -1.0, maxLng: 1.8 },
    { names: ['teruel'], minLat: 39.8, maxLat: 41.4, minLng: -1.8, maxLng: 0.4 },
    { names: ['toledo'], minLat: 39.2, maxLat: 40.4, minLng: -5.4, maxLng: -3.0 },
    { names: ['valencia'], minLat: 38.7, maxLat: 40.0, minLng: -1.4, maxLng: 0.1 },
    { names: ['valladolid'], minLat: 41.1, maxLat: 42.4, minLng: -5.4, maxLng: -4.0 },
    { names: ['bizkaia', 'vizcaya'], minLat: 42.8, maxLat: 43.6, minLng: -3.5, maxLng: -2.4 },
    { names: ['zamora'], minLat: 41.2, maxLat: 42.4, minLng: -7.2, maxLng: -5.0 },
    { names: ['zaragoza'], minLat: 40.9, maxLat: 42.5, minLng: -2.0, maxLng: 0.3 }
  ]

  const bounds = provinceBounds.find((b) =>
    b.names.some((name) => provincia.includes(name))
  )

  if (!bounds) {
    return lat >= 36 && lat <= 44.5 && lng >= -9.8 && lng <= 3.1
  }

  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  )
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function toRadians(value) {
  return value * Math.PI / 180
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return ''
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })
}

function loadCss(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[href="${href}"]`)
    if (existing) return resolve()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.onload = resolve
    document.head.appendChild(link)
  })
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function Reports({ profile }) {
  const [kmRows, setKmRows] = useState([])
  const [incidentRows, setIncidentRows] = useState([])

  async function load() {
    const { data: kmData, error: kmError } = await supabase
      .from('report_monthly_km_by_work')
      .select('*')
      .order('month', { ascending: false })

    if (kmError) {
      alert(kmError.message)
    } else {
      setKmRows(kmData || [])
    }

    const { data: incidentData, error: incidentError } = await supabase
  .from('incidents')
  .select('*, vehicles(plate, vehicle_name), files(id,file_name,file_type,storage_path)')
  .order('incident_date', { ascending: false })

    if (incidentError) {
      alert(incidentError.message)
    } else {
      setIncidentRows(incidentData || [])
    }
  }

  useEffect(() => {
    load()
  }, [])

  function downloadCsv(filename, rows) {
    if (!rows.length) {
      alert('No hay datos para exportar.')
      return
    }

    const headers = Object.keys(rows[0])

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return ''
      const text = String(value).replace(/"/g, '""')
      return `"${text}"`
    }

    const csv = [
      headers.join(';'),
      ...rows.map(row => headers.map(header => escapeCsv(row[header])).join(';'))
    ].join('\n')

    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8;'
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportKmCsv() {
    const rows = kmRows.map(r => ({
      mes: r.month,
      matricula: r.plate,
      vehiculo: r.vehicle_name || '',
      obra: r.work_name || '',
      km_imputados: r.km_allocated || 0,
      km_iniciales: r.km_start || '',
      km_finales: r.km_end || '',
      km_total: r.km_total || '',
      observaciones: r.notes || ''
    }))

    downloadCsv('informe_kilometros_por_obra.csv', rows)
  }

  function exportIncidentsCsv() {
    const rows = incidentRows.map(i => ({
      fecha: i.incident_date || '',
      matricula: i.vehicles?.plate || '',
      vehiculo: i.vehicles?.vehicle_name || '',
      obra: i.work_name || '',
      tipo: i.type || '',
      gravedad: i.severity || '',
      estado: i.status || '',
      descripcion: i.description || ''
    }))

    downloadCsv('historico_incidencias.csv', rows)
  }

  function generateIsoPdf() {
    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      alert('El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes para generar el PDF.')
      return
    }

    const kmHtml = kmRows.map(r => `
      <tr>
        <td>${r.month || ''}</td>
        <td>${r.plate || ''}</td>
        <td>${r.vehicle_name || ''}</td>
        <td>${r.work_name || ''}</td>
        <td>${r.km_allocated || 0}</td>
        <td>${r.km_start || ''}</td>
        <td>${r.km_end || ''}</td>
        <td>${r.km_total || ''}</td>
      </tr>
    `).join('')

    const incidentHtml = incidentRows.map(i => `
      <tr>
        <td>${i.incident_date || ''}</td>
        <td>${i.vehicles?.plate || ''}</td>
        <td>${i.vehicles?.vehicle_name || ''}</td>
        <td>${i.work_name || ''}</td>
        <td>${i.type || ''}</td>
        <td>${i.severity || ''}</td>
        <td>${i.status || ''}</td>
        <td>${i.description || ''}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Informe ISO Flota Eco Habitat</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 32px;
              color: #123c2c;
            }

            header {
              border-bottom: 2px solid #123c2c;
              margin-bottom: 24px;
              padding-bottom: 12px;
            }

            h1 {
              margin: 0;
              font-size: 24px;
            }

            h2 {
              margin-top: 28px;
              font-size: 18px;
            }

            p {
              color: #333;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
              font-size: 11px;
            }

            th, td {
              border: 1px solid #ccc;
              padding: 6px;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #e9f1ed;
            }

            .meta {
              font-size: 12px;
              color: #555;
            }

            .footer {
              margin-top: 32px;
              font-size: 11px;
              color: #666;
            }

            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <header>
            <h1>Informe ISO 9001 / ISO 14001 · Control de Vehículos</h1>
            <p class="meta">Eco Habitat · Generado el ${new Date().toLocaleDateString('es-ES')}</p>
          </header>

          <p>
            Informe de seguimiento de flota, kilómetros imputados por obra e incidencias abiertas.
            Documento de apoyo para control interno, trazabilidad y revisión del sistema de gestión.
          </p>

          <h2>Kilómetros por mes y obra</h2>
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Matrícula</th>
                <th>Vehículo</th>
                <th>Obra</th>
                <th>Km imputados</th>
                <th>Km iniciales</th>
                <th>Km finales</th>
                <th>Km total</th>
              </tr>
            </thead>
            <tbody>
              ${kmHtml || '<tr><td colspan="8">Sin datos.</td></tr>'}
            </tbody>
          </table>

          <h2>Incidencias abiertas</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Matrícula</th>
                <th>Vehículo</th>
                <th>Obra</th>
                <th>Tipo</th>
                <th>Gravedad</th>
                <th>Estado</th>
                <th>Descripción</th>
<th>PDF</th>
              </tr>
            </thead>
            <tbody>
              ${incidentHtml || '<tr><td colspan="8">Sin incidencias abiertas.</td></tr>'}
            </tbody>
          </table>

          <p class="footer">
            Este informe se genera a partir de los registros almacenados en la aplicación de control de vehículos.
            No sustituye a la revisión formal del responsable del sistema, pero sirve como evidencia documental de seguimiento.
          </p>

          <script>
            window.onload = () => window.print()
          </script>
        </body>
      </html>
    `)

    printWindow.document.close()
  }

  return (
    <section className="card">
      <h2>Informes ISO</h2>
      <p>
        Informes básicos para seguimiento de flota, control de kilómetros,
        incidencias abiertas y evidencias para ISO 9001/14001.
      </p>

      <button type="button" onClick={generateIsoPdf}>
        Generar PDF ISO
      </button>

      <h3>Kilómetros por mes y obra</h3>
      <button type="button" className="secondary" onClick={exportKmCsv}>
        Exportar kilómetros CSV
      </button>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Matrícula</th>
              <th>Obra</th>
              <th>Km imputados</th>
            </tr>
          </thead>
          <tbody>
            {kmRows.map((r, i) => (
              <tr key={i}>
                <td>{r.month}</td>
                <td>{r.plate}</td>
                <td>{r.work_name}</td>
                <td>{r.km_allocated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Histórico de incidencias</h3>
      <button type="button" className="secondary" onClick={exportIncidentsCsv}>
        Exportar incidencias CSV
      </button>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Matrícula</th>
              <th>Vehículo</th>
              <th>Obra</th>
              <th>Tipo</th>
              <th>Gravedad</th>
              <th>Estado</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {incidentRows.map((i) => (
              <tr key={i.id}>
                <td>{i.incident_date || ''}</td>
                <td>{i.vehicles?.plate || ''}</td>
                <td>{i.vehicles?.vehicle_name || ''}</td>
                <td>{i.work_name || ''}</td>
                <td>{i.type || ''}</td>
                <td>{i.severity || ''}</td>
                <td>{i.status || ''}</td>
                <td>{i.description || ''}</td>
<td>
  <button type="button" className="secondary" onClick={() => generateIncidentPdf(i)}>
    PDF incidencia
  </button>
</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
async function generateIncidentPdf(incident) {
  const printWindow = window.open('', '_blank')

  if (!printWindow) {
    alert('El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes para generar el PDF.')
    return
  }

  const files = incident.files || []
  const imageBlocks = []

  for (const file of files) {
    if (!file.storage_path) continue

    const { data, error } = await supabase.storage
      .from('vehiculos')
      .createSignedUrl(file.storage_path, 60)

    if (!error && data?.signedUrl) {
      imageBlocks.push(`
        <div class="photo-block">
          <p class="photo-title">${file.file_name || 'Evidencia fotográfica'}</p>
          <img src="${data.signedUrl}" />
        </div>
      `)
    }
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Informe incidencia ${incident.vehicles?.plate || ''}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #123c2c;
          }

          header {
            border-bottom: 2px solid #123c2c;
            margin-bottom: 24px;
            padding-bottom: 12px;
          }

          h1 {
            margin: 0;
            font-size: 24px;
          }

          h2 {
            margin-top: 24px;
            font-size: 18px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 12px;
          }

          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }

          th {
            width: 180px;
            background: #e9f1ed;
          }

          .meta {
            font-size: 12px;
            color: #555;
          }

          .description {
            white-space: pre-wrap;
          }

          .evidence-section {
  break-before: page;
  page-break-before: always;
}

.evidence-title {
  break-after: avoid;
  page-break-after: avoid;
}

.photo-block {
  break-inside: avoid;
  page-break-inside: avoid;
  margin-top: 18px;
}

.photo-title {
  font-size: 12px;
  color: #555;
  margin-bottom: 6px;
  break-after: avoid;
  page-break-after: avoid;
}

img {
  display: block;
  max-width: 100%;
  max-height: 640px;
  border: 1px solid #ccc;
  break-before: avoid;
  page-break-before: avoid;
}

          .footer {
            margin-top: 32px;
            font-size: 11px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>Informe individual de incidencia</h1>
          <p class="meta">Eco Habitat · Generado el ${new Date().toLocaleDateString('es-ES')}</p>
        </header>

        <h2>Datos de la incidencia</h2>
        <table>
          <tbody>
            <tr>
              <th>Fecha</th>
              <td>${incident.incident_date || ''}</td>
            </tr>
            <tr>
              <th>Matrícula</th>
              <td>${incident.vehicles?.plate || ''}</td>
            </tr>
            <tr>
              <th>Vehículo</th>
              <td>${incident.vehicles?.vehicle_name || ''}</td>
            </tr>
            <tr>
              <th>Obra</th>
              <td>${incident.work_name || ''}</td>
            </tr>
            <tr>
              <th>Tipo</th>
              <td>${incident.type || ''}</td>
            </tr>
            <tr>
              <th>Gravedad</th>
              <td>${incident.severity || ''}</td>
            </tr>
            <tr>
              <th>Estado</th>
              <td>${incident.status || ''}</td>
            </tr>
            <tr>
              <th>Descripción</th>
              <td class="description">${incident.description || ''}</td>
            </tr>
<tr>
  <th>Acción correctiva</th>
  <td class="description">${incident.corrective_action || ''}</td>
</tr>
<tr>
  <th>Responsable</th>
  <td>${incident.corrective_responsible || ''}</td>
</tr>
<tr>
  <th>Fecha de cierre</th>
  <td>${incident.closed_at ? String(incident.closed_at).slice(0, 10) : ''}</td>
</tr>
<tr>
  <th>Observaciones de cierre</th>
  <td class="description">${incident.closing_notes || ''}</td>
</tr>
          </tbody>
        </table>

        <section class="evidence-section">
  <h2 class="evidence-title">Evidencias fotográficas</h2>
  ${imageBlocks.length ? imageBlocks.join('') : '<p>No hay imágenes asociadas a esta incidencia.</p>'}
</section>

        <p class="footer">
          Documento generado desde la aplicación de control de vehículos como evidencia para seguimiento,
          trazabilidad y revisión del sistema de gestión ISO 9001 / ISO 14001.
        </p>

        <script>
          window.onload = () => window.print()
        </script>
      </body>
    </html>
  `)

  printWindow.document.close()
}

function canSeeReports(profile) {
  return ['admin', 'flota'].includes(profile?.role)
}

function canEdit(profile){ return ['admin','flota','jefe_obra'].includes(profile?.role) }

createRoot(document.getElementById('root')).render(<App />)
