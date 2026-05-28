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
        {['inicio','vehiculos','asignaciones','kilometros','incidencias','informes'].map(t => (
          <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{label(t)}</button>
        ))}
      </nav>
      {tab === 'inicio' && <Dashboard profile={profile} />}
      {tab === 'vehiculos' && <Vehicles profile={profile} />}
{tab === 'asignaciones' && <Assignments profile={profile} />}
      {tab === 'kilometros' && <KmForm profile={profile} />}
      {tab === 'incidencias' && <IncidentForm profile={profile} />}
      {tab === 'informes' && <Reports profile={profile} />}
    </Shell>
  )
}

function label(t){return {inicio:'Inicio',vehiculos:'Vehículos',asignaciones:'Asignaciones',kilometros:'Km',incidencias:'Incidencias',informes:'Informes'}[t]}

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
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  async function signIn(e){
    e.preventDefault(); setMessage('Entrando…')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? error.message : '')
  }
  return <Shell><form className="card" onSubmit={signIn}><h2>Entrar</h2><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label>Contraseña<input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></label><button>Entrar</button><p className="muted">Los usuarios se crean desde Supabase o desde el panel de administración que añadiremos después.</p>{message && <p>{message}</p>}</form></Shell>
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
  useEffect(() => { load() }, [])
  async function load(){
    const { data, error } = await supabase.from('vehicles').select('*, solred_cards(card_number,fuel_type,active), vehicle_assignments(driver_name,work_name,start_date,end_date)').order('plate')
    if (error) console.error(error)
    setVehicles(data || [])
  }
  return <section><div className="toolbar"><h2>Vehículos</h2>{canEdit(profile) && <button onClick={()=>setSelected({status:'activo'})}>Nuevo</button>}</div>{selected && <VehicleEditor vehicle={selected} onDone={()=>{setSelected(null);load()}}/>}<div className="list">{vehicles.map(v=><article className="card" key={v.id}><h3>{v.plate} · {v.brand} {v.model}</h3><p>{v.current_driver_name || 'Sin conductor'} · {v.primary_work_name || 'Sin obra'} · {v.status}</p><p>Solred: {v.solred_cards?.[0]?.card_number || 'sin tarjeta'}</p>{canEdit(profile)&&<button onClick={()=>setSelected(v)}>Modificar</button>}</article>)}</div></section>
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

function IncidentForm({ profile }) {
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
    setForm({severity:'leve',status:'abierta'}); setPhoto(null)
  }
  return <form className="card" onSubmit={save}><h2>Nueva incidencia</h2><label>Vehículo<select required value={form.vehicle_id||''} onChange={e=>patch('vehicle_id',e.target.value)}><option value="">Seleccionar</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</option>)}</select></label><div className="formgrid"><label>Obra<input value={form.work_name||''} onChange={e=>patch('work_name',e.target.value)}/></label><label>Tipo<select value={form.type||''} onChange={e=>patch('type',e.target.value)} required><option value="">Seleccionar</option><option>Avería</option><option>Accidente</option><option>Daño exterior</option><option>Neumáticos</option><option>ITV</option><option>Documentación</option><option>Tarjeta SOLRED</option><option>Otra</option></select></label><label>Gravedad<select value={form.severity} onChange={e=>patch('severity',e.target.value)}><option>leve</option><option>media</option><option>grave</option></select></label></div><label>Descripción<textarea required value={form.description||''} onChange={e=>patch('description',e.target.value)}/></label><label>Foto<input type="file" accept="image/*" capture="environment" onChange={e=>setPhoto(e.target.files?.[0])}/></label><button>Registrar incidencia</button></form>
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
  .neq('status', 'cerrada')

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

    downloadCsv('informe_incidencias_abiertas.csv', rows)
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

      <h3>Incidencias abiertas</h3>
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
function canEdit(profile){ return ['admin','flota','jefe_obra'].includes(profile?.role) }

createRoot(document.getElementById('root')).render(<App />)
