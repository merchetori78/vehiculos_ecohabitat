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
  ...(canReserve(profile) ? ['reservas'] : []),
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
      {tab === 'reservas' && canReserve(profile) && <ReservationsPage profile={profile} />}
      {tab === 'kilometros' && <KmForm profile={profile} />}
      {tab === 'incidencias' && <IncidentsPage profile={profile} />}
      {tab === 'gasolineras' && <GasolinerasPage profile={profile} />}
      {tab === 'informes' && canSeeReports(profile) && <Reports profile={profile} />}
    </Shell>
  )
}

function label(t){return {inicio:'Inicio',vehiculos:'Vehículos',asignaciones:'Asignaciones',reservas:'Reservas',kilometros:'Km',incidencias:'Incidencias',gasolineras:'Gasolineras',informes:'Informes'}[t]}

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

  const vehiclesWithAlerts = vehicles.filter(v => getVehicleAlerts(v).length)

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
              setSelected({ status: 'activo', ownership_type: 'propio' })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            Nuevo
          </button>
        )}
      </div>

      {!!vehiclesWithAlerts.length && (
        <div className="alert-summary card">
          <h3>Atención de mantenimiento</h3>
          <p>
            Hay <b>{vehiclesWithAlerts.length}</b> vehículo(s) con avisos de ITV, aceite o ruedas.
            Aparecen destacados en el listado.
          </p>
        </div>
      )}

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
        {vehicles.map(v => {
          const alerts = getVehicleAlerts(v)
          const ownershipLabel = getOwnershipLabel(v)

          return (
            <article className={`card vehicle-card ${alerts.length ? 'vehicle-card-alert' : ''}`} key={v.id}>
              <div className="vehicle-card-header">
                <div>
                  <h3>{v.plate} · {v.brand} {v.model}</h3>
                  <p>{v.current_driver_name || 'Sin conductor'} · {v.primary_work_name || 'Sin obra'} · {v.status}</p>
                </div>
                {!!alerts.length && <span className="alert-pill">{alerts.length} aviso(s)</span>}
              </div>

              {!!alerts.length && (
                <div className="maintenance-alerts">
                  {alerts.map((alert, i) => (
                    <span key={i} className={`maintenance-pill ${alert.level}`}>{alert.text}</span>
                  ))}
                </div>
              )}

              <div className="vehicle-info-grid">
                <p><b>Km actuales:</b> {formatNumber(v.current_km) || 'sin dato'}</p>
                <p><b>ITV:</b> {formatDate(v.itv_next_date) || 'sin dato'}</p>
                <p><b>Aceite:</b> {formatMaintenanceKm(v, 'oil')}</p>
                <p><b>Ruedas:</b> {formatMaintenanceKm(v, 'tyres')}</p>
                <p><b>Propiedad:</b> {ownershipLabel}</p>
                <p><b>Reservable:</b> {v.reservable ? 'Sí' : 'No'}</p>
              </div>

              {v.renting_end_date && (
                <p className="muted">Fin renting: {formatDate(v.renting_end_date)}</p>
              )}

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
          )
        })}
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

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function save(e) {
    e.preventDefault()

    const payload = {
      plate: form.plate,
      brand: form.brand,
      model: form.model,
      provider: form.provider,
      contract_line: form.contract_line,
      current_driver_name: form.current_driver_name,
      primary_work_name: form.primary_work_name,
      status: form.status || 'activo',
      reservable: !!form.reservable,
      ownership_type: form.ownership_type || 'propio',
      owner_company: form.owner_company || null,
      renting_company: form.renting_company || null,
      renting_contract_number: form.renting_contract_number || null,
      renting_start_date: form.renting_start_date || null,
      renting_end_date: form.renting_end_date || null,
      renting_monthly_cost: form.renting_monthly_cost || null,
      insurance_company: form.insurance_company || null,
      insurance_policy: form.insurance_policy || null,
      current_km: form.current_km === '' || form.current_km === undefined ? null : Number(form.current_km),
      itv_last_date: form.itv_last_date || null,
      itv_next_date: form.itv_next_date || null,
      itv_notes: form.itv_notes || null,
      oil_last_km: form.oil_last_km === '' || form.oil_last_km === undefined ? null : Number(form.oil_last_km),
      oil_interval_km: form.oil_interval_km === '' || form.oil_interval_km === undefined ? null : Number(form.oil_interval_km),
      tyres_last_km: form.tyres_last_km === '' || form.tyres_last_km === undefined ? null : Number(form.tyres_last_km),
      tyres_interval_km: form.tyres_interval_km === '' || form.tyres_interval_km === undefined ? null : Number(form.tyres_interval_km),
      maintenance_notes: form.maintenance_notes || null,
      notes: form.notes
    }

    const res = form.id
      ? await supabase.from('vehicles').update(payload).eq('id', form.id)
      : await supabase.from('vehicles').insert(payload)

    if (res.error) alert(res.error.message)
    else onDone()
  }

  return (
    <form className="card" onSubmit={save}>
      <h3>{form.id ? 'Modificar vehículo' : 'Alta vehículo'}</h3>

      <h4>Datos básicos</h4>
      <div className="formgrid">
        <label>Matrícula<input value={form.plate || ''} onChange={e => set('plate', e.target.value.toUpperCase())} required /></label>
        <label>Marca<input value={form.brand || ''} onChange={e => set('brand', e.target.value)} /></label>
        <label>Modelo<input value={form.model || ''} onChange={e => set('model', e.target.value)} /></label>
        <label>Conductor<input value={form.current_driver_name || ''} onChange={e => set('current_driver_name', e.target.value)} /></label>
        <label>Obra habitual<input value={form.primary_work_name || ''} onChange={e => set('primary_work_name', e.target.value)} /></label>
        <label>Estado<select value={form.status || 'activo'} onChange={e => set('status', e.target.value)}><option>activo</option><option>en revisión</option><option>baja</option><option>sustituido</option><option>pendiente entrega</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={!!form.reservable} onChange={e => set('reservable', e.target.checked)} /> Reservable</label>
      </div>

      <h4>Propiedad / renting</h4>
      <div className="formgrid">
        <label>Tipo de propiedad<select value={form.ownership_type || 'propio'} onChange={e => set('ownership_type', e.target.value)}><option value="propio">Propio</option><option value="renting">Renting</option></select></label>
        <label>Propietario / empresa<input value={form.owner_company || ''} onChange={e => set('owner_company', e.target.value)} placeholder="Eco Habitat, renting…" /></label>
        <label>Empresa renting<input value={form.renting_company || ''} onChange={e => set('renting_company', e.target.value)} placeholder="Arval, Alphabet, LeasePlan…" /></label>
        <label>Nº contrato renting<input value={form.renting_contract_number || ''} onChange={e => set('renting_contract_number', e.target.value)} /></label>
        <label>Inicio renting<input type="date" value={form.renting_start_date || ''} onChange={e => set('renting_start_date', e.target.value)} /></label>
        <label>Fin renting<input type="date" value={form.renting_end_date || ''} onChange={e => set('renting_end_date', e.target.value)} /></label>
        <label>Coste mensual<input type="number" step="0.01" value={form.renting_monthly_cost || ''} onChange={e => set('renting_monthly_cost', e.target.value)} /></label>
        <label>Seguro<input value={form.insurance_company || ''} onChange={e => set('insurance_company', e.target.value)} /></label>
        <label>Nº póliza<input value={form.insurance_policy || ''} onChange={e => set('insurance_policy', e.target.value)} /></label>
      </div>

      <h4>Mantenimiento preventivo</h4>
      <p className="muted">El aviso de aceite y ruedas se calcula con los km actuales, los km del último cambio y el intervalo recomendado.</p>
      <div className="formgrid">
        <label>Km actuales<input type="number" value={form.current_km || ''} onChange={e => set('current_km', e.target.value)} /></label>
        <label>Última ITV<input type="date" value={form.itv_last_date || ''} onChange={e => set('itv_last_date', e.target.value)} /></label>
        <label>Próxima ITV<input type="date" value={form.itv_next_date || ''} onChange={e => set('itv_next_date', e.target.value)} /></label>
        <label>Aceite: último cambio km<input type="number" value={form.oil_last_km || ''} onChange={e => set('oil_last_km', e.target.value)} /></label>
        <label>Aceite: intervalo recomendado km<input type="number" value={form.oil_interval_km || ''} onChange={e => set('oil_interval_km', e.target.value)} placeholder="Ej. 30000" /></label>
        <label>Ruedas: último cambio km<input type="number" value={form.tyres_last_km || ''} onChange={e => set('tyres_last_km', e.target.value)} /></label>
        <label>Ruedas: intervalo recomendado km<input type="number" value={form.tyres_interval_km || ''} onChange={e => set('tyres_interval_km', e.target.value)} placeholder="Ej. 40000" /></label>
      </div>

      <label>Observaciones ITV<textarea value={form.itv_notes || ''} onChange={e => set('itv_notes', e.target.value)} /></label>
      <label>Observaciones mantenimiento<textarea value={form.maintenance_notes || ''} onChange={e => set('maintenance_notes', e.target.value)} /></label>
      <label>Observaciones generales<textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></label>

      <button>Guardar</button>
      <button type="button" className="secondary" onClick={onDone}>Cancelar</button>
    </form>
  )
}

function KmForm({ profile }) {
  const today = new Date().toISOString().slice(0, 10)
  const [vehicles, setVehicles] = useState([])
  const [dailyRows, setDailyRows] = useState([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    vehicle_id: '',
    date: today,
    driver_name: profile?.full_name || profile?.email || '',
    work_name: '',
    km_start: '',
    km_end: '',
    notes: ''
  })

  useEffect(() => { load() }, [])

  function patch(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function load() {
    const { data: vehicleData, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id,plate,brand,model,current_driver_name,primary_work_name,current_km,status')
      .eq('status', 'activo')
      .order('plate')

    if (vehicleError) setMessage(vehicleError.message)
    else setVehicles(vehicleData || [])

    const { data: kmData, error: kmError } = await supabase
      .from('daily_km')
      .select('*, vehicles(plate,brand,model)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)

    if (kmError) setMessage(kmError.message)
    else setDailyRows(kmData || [])
  }

  function onVehicleChange(vehicleId) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    patch('vehicle_id', vehicleId)
    if (vehicle) {
      setForm(f => ({
        ...f,
        vehicle_id: vehicleId,
        driver_name: f.driver_name || vehicle.current_driver_name || profile?.full_name || profile?.email || '',
        work_name: f.work_name || vehicle.primary_work_name || '',
        km_start: vehicle.current_km ?? f.km_start ?? ''
      }))
    }
  }

  async function save(e) {
    e.preventDefault()
    setMessage('')

    const kmStart = Number(form.km_start)
    const kmEnd = Number(form.km_end)

    if (!Number.isFinite(kmStart) || !Number.isFinite(kmEnd)) {
      setMessage('Indica km iniciales y finales válidos.')
      return
    }

    if (kmEnd < kmStart) {
      setMessage('Los km finales no pueden ser inferiores a los iniciales.')
      return
    }

    const payload = {
      vehicle_id: form.vehicle_id,
      date: form.date,
      driver_name: form.driver_name || profile?.full_name || profile?.email || null,
      work_name: form.work_name || null,
      km_start: kmStart,
      km_end: kmEnd,
      notes: form.notes || null,
      created_by: profile?.id || null
    }

    const { error } = await supabase.from('daily_km').insert(payload)
    if (error) {
      setMessage(error.message)
      return
    }

    await supabase
      .from('vehicles')
      .update({ current_km: kmEnd })
      .eq('id', form.vehicle_id)

    setMessage('Kilómetros diarios guardados correctamente.')
    setForm(f => ({
      ...f,
      km_start: kmEnd,
      km_end: '',
      notes: ''
    }))
    load()
  }

  return (
    <section>
      <form className="card" onSubmit={save}>
        <h2>Kilómetros diarios</h2>
        <p className="muted">Registra los kilómetros al final de cada día o al finalizar el uso del vehículo.</p>
        {message && <p className={message.includes('correctamente') ? 'success' : 'error'}>{message}</p>}

        <label>
          Vehículo
          <select required value={form.vehicle_id || ''} onChange={e => onVehicleChange(e.target.value)}>
            <option value="">Seleccionar</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model} · km {formatNumber(v.current_km) || 'sin dato'}</option>)}
          </select>
        </label>

        <div className="formgrid">
          <label>Fecha<input type="date" required value={form.date} onChange={e => patch('date', e.target.value)} /></label>
          <label>Conductor<input required value={form.driver_name || ''} onChange={e => patch('driver_name', e.target.value)} placeholder="Nombre conductor" /></label>
          <label>Obra<input value={form.work_name || ''} onChange={e => patch('work_name', e.target.value)} placeholder="Obra o centro de trabajo" /></label>
          <label>Km iniciales<input type="number" required value={form.km_start || ''} onChange={e => patch('km_start', e.target.value)} /></label>
          <label>Km finales<input type="number" required value={form.km_end || ''} onChange={e => patch('km_end', e.target.value)} /></label>
        </div>

        <p className="muted">
          Km del día: {Number.isFinite(Number(form.km_end)) && Number.isFinite(Number(form.km_start)) && Number(form.km_end) >= Number(form.km_start)
            ? formatNumber(Number(form.km_end) - Number(form.km_start))
            : '—'}
        </p>

        <label>Observaciones<textarea value={form.notes || ''} onChange={e => patch('notes', e.target.value)} /></label>
        <button>Guardar kilómetros diarios</button>
      </form>

      <section className="card">
        <h3>Registros recientes</h3>
        {!dailyRows.length && <p className="muted">Todavía no hay kilómetros diarios registrados.</p>}
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vehículo</th>
                <th>Conductor</th>
                <th>Obra</th>
                <th>Km inicio</th>
                <th>Km fin</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(row => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.vehicles?.plate || ''} · {row.vehicles?.brand || ''} {row.vehicles?.model || ''}</td>
                  <td>{row.driver_name || ''}</td>
                  <td>{row.work_name || ''}</td>
                  <td>{formatNumber(row.km_start)}</td>
                  <td>{formatNumber(row.km_end)}</td>
                  <td>{formatNumber(row.km_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
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


function ReservationsPage({ profile }) {
  const [vehicles, setVehicles] = useState([])
  const [reservations, setReservations] = useState([])
  const [loadingReservations, setLoadingReservations] = useState(true)
  const [message, setMessage] = useState('')
  const [reservationView, setReservationView] = useState('list')
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => getMonday(new Date()))
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    vehicle_id: '',
    reserved_by_name: profile?.full_name || profile?.email || '',
    work_name: '',
    purpose: '',
    start_date: today,
    start_time: '08:00',
    end_date: today,
    end_time: '18:00',
    all_day: false,
    notes: ''
  })

  useEffect(() => {
    loadReservationsData()
  }, [])

  function patch(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function loadReservationsData() {
    setLoadingReservations(true)
    setMessage('')

    const { data: vehicleData, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id,plate,brand,model,current_driver_name,primary_work_name,status,reservable')
      .eq('status', 'activo')
      .eq('reservable', true)
      .order('plate')

    if (vehicleError) {
      setMessage(vehicleError.message)
      setVehicles([])
    } else {
      setVehicles(vehicleData || [])
    }

    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 1)

    const { data: reservationData, error: reservationError } = await supabase
      .from('vehicle_reservations')
      .select('*, vehicles(plate,brand,model,current_driver_name,primary_work_name)')
      .gte('end_at', fromDate.toISOString())
      .order('start_at', { ascending: true })

    if (reservationError) {
      setMessage(reservationError.message)
      setReservations([])
    } else {
      setReservations(reservationData || [])
    }

    setLoadingReservations(false)
  }

  function buildReservationDates() {
    if (!form.start_date || !form.end_date) {
      throw new Error('Indica fecha de inicio y fecha de fin.')
    }

    if (form.all_day) {
      const start = new Date(`${form.start_date}T00:00:00`)
      const end = new Date(`${form.end_date}T00:00:00`)
      end.setDate(end.getDate() + 1)
      return { start, end }
    }

    if (!form.start_time || !form.end_time) {
      throw new Error('Indica hora de inicio y hora de fin.')
    }

    return {
      start: new Date(`${form.start_date}T${form.start_time}:00`),
      end: new Date(`${form.end_date}T${form.end_time}:00`)
    }
  }

  async function saveReservation(e) {
    e.preventDefault()
    setMessage('')

    if (!form.vehicle_id) {
      setMessage('Selecciona un vehículo reservable.')
      return
    }

    if (!form.reserved_by_name.trim()) {
      setMessage('Indica el nombre de la persona que reserva.')
      return
    }

    let dates
    try {
      dates = buildReservationDates()
    } catch (error) {
      setMessage(error.message)
      return
    }

    if (!(dates.end > dates.start)) {
      setMessage('La fecha/hora de fin debe ser posterior a la de inicio.')
      return
    }

    const startIso = dates.start.toISOString()
    const endIso = dates.end.toISOString()

    const { data: conflicts, error: conflictError } = await supabase
      .from('vehicle_reservations')
      .select('id,start_at,end_at,reserved_by_name,work_name,purpose')
      .eq('vehicle_id', form.vehicle_id)
      .eq('status', 'confirmada')
      .lt('start_at', endIso)
      .gt('end_at', startIso)

    if (conflictError) {
      setMessage(conflictError.message)
      return
    }

    if ((conflicts || []).length) {
      const c = conflicts[0]
      setMessage(`No se puede reservar: ya existe una reserva de ${formatDateTime(c.start_at)} a ${formatDateTime(c.end_at)} para ${c.reserved_by_name || 'otra persona'}.`)
      return
    }

    const payload = {
      vehicle_id: form.vehicle_id,
      reserved_by: profile.id,
      reserved_by_name: form.reserved_by_name.trim(),
      work_name: form.work_name || null,
      purpose: form.purpose || null,
      start_at: startIso,
      end_at: endIso,
      all_day: !!form.all_day,
      status: 'confirmada',
      notes: form.notes || null
    }

    const { error } = await supabase
      .from('vehicle_reservations')
      .insert(payload)

    if (error) {
      if (error.code === '23P01' || String(error.message || '').toLowerCase().includes('overlap')) {
        setMessage('No se puede reservar: el vehículo ya tiene una reserva confirmada en ese periodo.')
      } else {
        setMessage(error.message)
      }
      return
    }

    setMessage('Reserva confirmada correctamente.')
    setForm(f => ({
      ...f,
      vehicle_id: '',
      work_name: '',
      purpose: '',
      notes: ''
    }))
    loadReservationsData()
  }

  async function cancelReservation(reservation) {
    const ok = window.confirm('¿Cancelar esta reserva?')
    if (!ok) return

    const { error } = await supabase
      .from('vehicle_reservations')
      .update({
        status: 'cancelada',
        cancelled_at: new Date().toISOString(),
        cancelled_by: profile.id
      })
      .eq('id', reservation.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Reserva cancelada.')
    loadReservationsData()
  }

  function goToPreviousWeek() {
    setCalendarWeekStart(d => addDays(d, -7))
  }

  function goToNextWeek() {
    setCalendarWeekStart(d => addDays(d, 7))
  }

  function goToCurrentWeek() {
    setCalendarWeekStart(getMonday(new Date()))
  }

  const confirmedReservations = reservations.filter(r => r.status === 'confirmada')
  const cancelledReservations = reservations.filter(r => r.status === 'cancelada')
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(calendarWeekStart, i))
  const weekEnd = addDays(calendarWeekStart, 5)
  const weekReservations = confirmedReservations.filter(r => reservationOverlapsRange(r, calendarWeekStart, weekEnd))

  return (
    <section>
      <div className="toolbar">
        <h2>Reservas de vehículos</h2>
        <button type="button" className="secondary" onClick={loadReservationsData}>Actualizar</button>
      </div>

      <form className="card" onSubmit={saveReservation}>
        <h3>Nueva reserva</h3>
        <p className="muted">
          Solo aparecen vehículos marcados como reservables. La reserva se confirma automáticamente si no hay otra reserva solapada.
        </p>

        {message && <p className={message.includes('correctamente') || message.includes('cancelada') ? 'success' : 'error'}>{message}</p>}

        <div className="formgrid">
          <label>
            Vehículo
            <select required value={form.vehicle_id} onChange={e => patch('vehicle_id', e.target.value)}>
              <option value="">Seleccionar</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} · {v.brand || ''} {v.model || ''}</option>
              ))}
            </select>
          </label>

          <label>
            Persona que reserva
            <input required value={form.reserved_by_name} onChange={e => patch('reserved_by_name', e.target.value)} />
          </label>

          <label>
            Obra
            <input value={form.work_name} onChange={e => patch('work_name', e.target.value)} placeholder="Obra o centro de trabajo" />
          </label>

          <label>
            Motivo
            <input value={form.purpose} onChange={e => patch('purpose', e.target.value)} placeholder="Reunión, visita, obra…" />
          </label>
        </div>

        <label className="checkbox-label reservation-checkbox">
          <input type="checkbox" checked={form.all_day} onChange={e => patch('all_day', e.target.checked)} />
          Día completo
        </label>

        <div className="formgrid">
          <label>
            Fecha inicio
            <input type="date" required value={form.start_date} onChange={e => patch('start_date', e.target.value)} />
          </label>

          {!form.all_day && (
            <label>
              Hora inicio
              <input type="time" required value={form.start_time} onChange={e => patch('start_time', e.target.value)} />
            </label>
          )}

          <label>
            Fecha fin
            <input type="date" required value={form.end_date} onChange={e => patch('end_date', e.target.value)} />
          </label>

          {!form.all_day && (
            <label>
              Hora fin
              <input type="time" required value={form.end_time} onChange={e => patch('end_time', e.target.value)} />
            </label>
          )}
        </div>

        <label>
          Observaciones
          <textarea value={form.notes} onChange={e => patch('notes', e.target.value)} placeholder="Detalles adicionales" />
        </label>

        <button>Confirmar reserva</button>
      </form>

      <section className="card">
        <div className="reservations-view-header">
          <div>
            <h3>Reservas confirmadas</h3>
            <p className="muted">Puedes verlas como listado o como calendario laboral de lunes a viernes.</p>
          </div>
          <div className="view-toggle">
            <button type="button" className={reservationView === 'list' ? 'active' : 'secondary'} onClick={() => setReservationView('list')}>
              Listado
            </button>
            <button type="button" className={reservationView === 'calendar' ? 'active' : 'secondary'} onClick={() => setReservationView('calendar')}>
              Calendario laboral
            </button>
          </div>
        </div>

        {loadingReservations && <p>Cargando reservas…</p>}
        {!loadingReservations && !confirmedReservations.length && <p className="muted">No hay reservas confirmadas próximas.</p>}

        {!loadingReservations && reservationView === 'list' && (
          <div className="reservation-list">
            {confirmedReservations.map(r => (
              <article key={r.id} className="reservation-item">
                <div>
                  <h4>{r.vehicles?.plate || ''} · {r.vehicles?.brand || ''} {r.vehicles?.model || ''}</h4>
                  <p><b>{formatDateTime(r.start_at)}</b> → <b>{formatDateTime(r.end_at)}</b>{r.all_day ? ' · Día completo' : ''}</p>
                  <p>{r.reserved_by_name || ''}{r.work_name ? ` · ${r.work_name}` : ''}{r.purpose ? ` · ${r.purpose}` : ''}</p>
                  {r.notes && <p className="muted">{r.notes}</p>}
                </div>
                <button type="button" className="secondary" onClick={() => cancelReservation(r)}>Cancelar</button>
              </article>
            ))}
          </div>
        )}

        {!loadingReservations && reservationView === 'calendar' && (
          <div className="work-calendar-wrap">
            <div className="calendar-toolbar">
              <button type="button" className="secondary" onClick={goToPreviousWeek}>← Semana anterior</button>
              <div>
                <b>Semana del {formatDateOnly(calendarWeekStart)} al {formatDateOnly(addDays(calendarWeekStart, 4))}</b>
                <p className="muted">Vista laboral de lunes a viernes.</p>
              </div>
              <button type="button" className="secondary" onClick={goToCurrentWeek}>Hoy</button>
              <button type="button" className="secondary" onClick={goToNextWeek}>Semana siguiente →</button>
            </div>

            <div className="work-calendar">
              {weekDays.map(day => {
                const dayReservations = weekReservations
                  .filter(r => reservationTouchesDay(r, day))
                  .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

                return (
                  <div key={day.toISOString()} className="calendar-day">
                    <div className="calendar-day-header">
                      <strong>{formatWeekday(day)}</strong>
                      <span>{formatDateOnly(day)}</span>
                    </div>

                    {!dayReservations.length && <p className="muted calendar-empty">Sin reservas</p>}

                    {dayReservations.map(r => (
                      <article key={`${r.id}-${day.toISOString()}`} className="calendar-reservation">
                        <span className="calendar-time">{formatReservationForDay(r, day)}</span>
                        <b>{r.vehicles?.plate || 'Vehículo'}</b>
                        <span>{r.reserved_by_name || ''}</span>
                        {r.work_name && <span>{r.work_name}</span>}
                        {r.purpose && <small>{r.purpose}</small>}
                        <button type="button" className="secondary calendar-cancel" onClick={() => cancelReservation(r)}>Cancelar</button>
                      </article>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {!!cancelledReservations.length && (
        <section className="card">
          <h3>Reservas canceladas recientes</h3>
          <div className="reservation-list compact">
            {cancelledReservations.slice(0, 10).map(r => (
              <article key={r.id} className="reservation-item cancelled">
                <div>
                  <h4>{r.vehicles?.plate || ''} · {r.vehicles?.brand || ''} {r.vehicles?.model || ''}</h4>
                  <p>{formatDateTime(r.start_at)} → {formatDateTime(r.end_at)}</p>
                  <p>{r.reserved_by_name || ''}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

function getMonday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date) {
  const d = startOfDay(date)
  d.setDate(d.getDate() + 1)
  return d
}

function reservationOverlapsRange(reservation, rangeStart, rangeEnd) {
  const start = new Date(reservation.start_at)
  const end = new Date(reservation.end_at)
  return start < rangeEnd && end > rangeStart
}

function reservationTouchesDay(reservation, day) {
  return reservationOverlapsRange(reservation, startOfDay(day), endOfDay(day))
}

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit'
  })
}

function formatWeekday(value) {
  return new Date(value).toLocaleDateString('es-ES', {
    weekday: 'long'
  })
}

function formatTimeOnly(value) {
  return new Date(value).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatReservationForDay(reservation, day) {
  if (reservation.all_day) return 'Día completo'

  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  const start = new Date(reservation.start_at)
  const end = new Date(reservation.end_at)

  const displayStart = start > dayStart ? start : dayStart
  const displayEnd = end < dayEnd ? end : dayEnd

  return `${formatTimeOnly(displayStart)} - ${formatTimeOnly(displayEnd)}`
}


function GasolinerasPage() {
  const [gasolineras, setGasolineras] = useState([])
  const [loadingGasolineras, setLoadingGasolineras] = useState(true)
  const [search, setSearch] = useState('')
  const [province, setProvince] = useState('')
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
  }, [gasolineras, search, province, userLocation, radiusKm])

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
        .select('codigo,codigo_solred,nombre,rotulo,direccion,municipio,provincia,latitud,longitud,descuento,descuento_texto,combustibles_descuento,comunidad_autonoma,codigo_postal,margen,horario,productos,servicios,google_maps_url,activa')
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
      const text = `${g.nombre || ''} ${g.rotulo || ''} ${g.direccion || ''} ${g.municipio || ''} ${g.provincia || ''} ${g.codigo_solred || ''} ${g.combustibles_descuento || ''} ${g.horario || ''} ${g.servicios || ''}`.toLowerCase()
      const matchesSearch = !search || text.includes(search.toLowerCase())
      const matchesProvince = !province || g.provincia === province
      const matchesRadius = !userLocation || !radiusKm || (g.distanceKm !== null && g.distanceKm <= Number(radiusKm))
      return matchesSearch && matchesProvince && matchesRadius
    })
    .sort((a, b) => {
      if (!userLocation) return 0
      if (a.distanceKm === null) return 1
      if (b.distanceKm === null) return -1
      return a.distanceKm - b.distanceKm
    })

  const withCoords = filtered.filter(g => hasValidCoords(g, province))
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
        radius: 5,
        weight: 1,
        fillOpacity: 0.7
      })

      marker.bindPopup(`
        <strong>${escapeHtml(g.nombre || 'Gasolinera')}</strong><br/>
        ${g.distanceKm !== null ? `<b>A ${formatDistance(g.distanceKm)}</b><br/>` : ''}
        ${escapeHtml(g.direccion || '')}<br/>
        ${escapeHtml([g.municipio, g.provincia].filter(Boolean).join(', '))}<br/>
        <b>Descuento:</b> ${escapeHtml(g.descuento_texto || `${g.descuento ?? 6} cts/l`)}<br/>
        ${g.combustibles_descuento ? `<b>Combustible:</b> ${escapeHtml(g.combustibles_descuento)}<br/>` : ''}
        ${g.horario ? `<b>Horario:</b> ${escapeHtml(g.horario)}<br/>` : ''}
        ${g.servicios ? `<b>Servicios:</b> ${escapeHtml(g.servicios)}<br/>` : ''}
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
        <h2>Gasolineras Repsol 6 cts/l</h2>
        <button type="button" className="secondary" onClick={loadGasolineras}>Actualizar</button>
      </div>

      <div className="card">
        <p className="muted">
          Red contractual de estaciones Repsol con descuento de 6 cts/l. Consulta el mapa, filtra por provincia o usa tu ubicación para encontrar la estación más cercana.
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

        </div>

        <div className="gasolineras-stats">
          <span><b>{filtered.length}</b> estaciones</span>
          <span><b>{withCoords.length}</b> con mapa</span>
          <span><b>6 cts/l</b> descuento Repsol</span>
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
                <th>Combustible</th>
                <th>Horario</th>
                <th>Descuento</th>
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
                  <td>{g.combustibles_descuento || ''}</td>
                  <td>{g.horario || ''}</td>
                  <td>{g.descuento_texto || `${g.descuento || 6} cts/l`}</td>
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

function hasValidCoords(g, selectedProvince = '') {
  const lat = Number(g.latitud)
  const lng = Number(g.longitud)

  const rowProvince = String(g.provincia || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const filterProvince = String(selectedProvince || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const provinceToValidate = filterProvince || rowProvince

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
    b.names.some((name) => provinceToValidate.includes(name))
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

function formatDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-ES')
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(number)
}

function getOwnershipLabel(vehicle) {
  if ((vehicle.ownership_type || '').toLowerCase() === 'renting') {
    return `Renting${vehicle.renting_company ? ` · ${vehicle.renting_company}` : vehicle.owner_company ? ` · ${vehicle.owner_company}` : ''}`
  }
  return `Propio${vehicle.owner_company ? ` · ${vehicle.owner_company}` : ''}`
}

function getKmMaintenance(vehicle, type) {
  const current = Number(vehicle.current_km)
  const last = Number(type === 'oil' ? vehicle.oil_last_km : vehicle.tyres_last_km)
  const interval = Number(type === 'oil' ? vehicle.oil_interval_km : vehicle.tyres_interval_km)

  if (!Number.isFinite(current) || !Number.isFinite(last) || !Number.isFinite(interval) || interval <= 0) {
    return null
  }

  const next = last + interval
  return {
    next,
    remaining: next - current
  }
}

function formatMaintenanceKm(vehicle, type) {
  const data = getKmMaintenance(vehicle, type)
  if (!data) return 'sin dato'
  if (data.remaining < 0) return `vencido hace ${formatNumber(Math.abs(data.remaining))} km`
  return `faltan ${formatNumber(data.remaining)} km`
}

function getVehicleAlerts(vehicle) {
  const alerts = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (vehicle.itv_next_date) {
    const itvDate = new Date(`${vehicle.itv_next_date}T00:00:00`)
    const days = Math.ceil((itvDate - today) / (1000 * 60 * 60 * 24))
    if (days < 0) alerts.push({ level: 'critical', text: `ITV vencida hace ${Math.abs(days)} día(s)` })
    else if (days <= 30) alerts.push({ level: 'warning', text: `ITV vence en ${days} día(s)` })
  }

  const oil = getKmMaintenance(vehicle, 'oil')
  if (oil) {
    if (oil.remaining < 0) alerts.push({ level: 'critical', text: `Aceite vencido ${formatNumber(Math.abs(oil.remaining))} km` })
    else if (oil.remaining <= 1000) alerts.push({ level: 'warning', text: `Aceite en ${formatNumber(oil.remaining)} km` })
  }

  const tyres = getKmMaintenance(vehicle, 'tyres')
  if (tyres) {
    if (tyres.remaining < 0) alerts.push({ level: 'critical', text: `Ruedas vencidas ${formatNumber(Math.abs(tyres.remaining))} km` })
    else if (tyres.remaining <= 2000) alerts.push({ level: 'warning', text: `Ruedas en ${formatNumber(tyres.remaining)} km` })
  }

  return alerts
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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

function canReserve(profile) {
  return ['admin', 'flota', 'jefe_obra'].includes(profile?.role)
}

function canEdit(profile){ return ['admin','flota','jefe_obra'].includes(profile?.role) }

createRoot(document.getElementById('root')).render(<App />)
