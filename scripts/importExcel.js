import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const file = process.argv[2]
if (!file) throw new Error('Uso: node --env-file=.env scripts/importExcel.js sample-data/archivo.xlsx')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
}

const supabase = createClient(supabaseUrl, serviceKey)
const workbook = XLSX.readFile(file, { cellDates: true })

const normalizePlate = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')

const asText = (value) => {
  if (value === undefined || value === null || value === '') return null
  return String(value).trim()
}

const asBool = (value) => {
  return ['sí', 'si', 'true', '1', 'x', 'entregada'].includes(
    String(value || '').trim().toLowerCase()
  )
}

const asNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const excelDateToIso = (value) => {
  if (!value) return null

  if (value instanceof Date && !Number.isNaN(value)) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    const yyyy = parsed.y
    const mm = String(parsed.m).padStart(2, '0')
    const dd = String(parsed.d).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const text = String(value).trim().toLowerCase()
  if (text === 'ilimitado') return null

  return null
}

const normalizeHeader = (value) =>
  String(value || '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const rowsFromSheet = (sheetName, headerRowIndex) => {
  const ws = workbook.Sheets[sheetName]
  if (!ws) return []

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const headers = (matrix[headerRowIndex] || []).map(normalizeHeader)
  const rows = []

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i]
    const row = {}

    headers.forEach((header, index) => {
      if (header) row[header] = raw[index]
    })

    rows.push(row)
  }

  return rows
}

const splitBrandModel = (vehicleName) => {
  const text = asText(vehicleName)
  if (!text) return { brand: null, model: null }

  const parts = text.split(' ')
  return {
    brand: parts[0] || null,
    model: parts.slice(1).join(' ') || null
  }
}

async function upsertVehicle(row, defaults = {}) {
  const plate = normalizePlate(row['MATRÍCULA'] || row['Matrícula'])
  if (!plate || plate === 'MATRÍCULA') return null

  const vehicleName =
    asText(row['VEHÍCULO']) ||
    [asText(row['Marca']), asText(row['Modelo'])].filter(Boolean).join(' ') ||
    null

  const guessed = splitBrandModel(vehicleName)

  const activeValue = row['Activo']
  const status =
    activeValue === undefined || activeValue === null
      ? 'activo'
      : asBool(activeValue)
        ? 'activo'
        : 'baja'

  const payload = {
    plate,
    vehicle_name: vehicleName,
    brand: asText(row['Marca']) || guessed.brand,
    model: asText(row['Modelo']) || guessed.model,
    provider: asText(row['PROVEEDOR']) || defaults.provider || null,
    customer: asText(row['CLIENTE']) || defaults.customer || null,
    contract_line: asText(row['LÍNEA']) || null,
    accessories: asText(row['ACCESORIOS']) || null,
    km_year: asText(row['KM/AÑO']) || null,
    current_driver_name: asText(row['CONDUCTOR']) || null,
    primary_work_name: asText(row['OBRA']) || null,
    lease_start: excelDateToIso(row['INICIO RENTING']),
    lease_end: excelDateToIso(row['FECHA VENCIMIENTO']),
    monthly_amount: asNumber(row['IMPORTE MENSUAL (i/e)']),
    v16: asBool(row['V16']),
    status,
    ...defaults
  }

  const { data, error } = await supabase
    .from('vehicles')
    .upsert(payload, { onConflict: 'plate' })
    .select()
    .single()

  if (error) throw error

  if (payload.current_driver_name || payload.primary_work_name) {
    const assignmentPayload = {
      vehicle_id: data.id,
      driver_name: payload.current_driver_name,
      work_name: payload.primary_work_name,
      start_date: payload.lease_start || new Date().toISOString().slice(0, 10),
      notes: 'Asignación inicial importada desde Excel'
    }

    const { error: assignmentError } = await supabase
      .from('vehicle_assignments')
      .insert(assignmentPayload)

    if (assignmentError) {
      console.warn(`No se pudo crear asignación para ${plate}:`, assignmentError.message)
    }
  }

  return data
}

async function importRentingSheet(sheetName, vehicleType) {
  if (!workbook.Sheets[sheetName]) return

  const rows = rowsFromSheet(sheetName, 1)

  for (const row of rows) {
    if (!row['MATRÍCULA']) continue
    await upsertVehicle(row, { vehicle_type: vehicleType })
  }

  console.log(`Importada hoja ${sheetName}`)
}

async function importPropios() {
  if (!workbook.Sheets['propios']) return

  const rows = rowsFromSheet('propios', 1)

  for (const row of rows) {
    if (!row['MATRÍCULA']) continue

    const plate = normalizePlate(row['MATRÍCULA'])
    const vehicleName = asText(row['VEHÍCULO'])
    const guessed = splitBrandModel(vehicleName)

    const payload = {
      plate,
      vehicle_name: vehicleName,
      brand: guessed.brand,
      model: guessed.model,
      vehicle_type: 'propio',
      customer: asText(row['PROPIETARIO']),
      accessories: asText(row['ACCESORIOS']),
      lease_start: null,
      lease_end: excelDateToIso(row['FECHA ITV']),
      v16: asBool(row['V16']),
      notes: asText(row['PERIODICIDAD ITV'])
        ? `Periodicidad ITV: ${asText(row['PERIODICIDAD ITV'])}`
        : null,
      status: 'activo'
    }

    const { error } = await supabase
      .from('vehicles')
      .upsert(payload, { onConflict: 'plate' })

    if (error) throw error
  }

  console.log('Importada hoja propios')
}

async function importSolred() {
  if (!workbook.Sheets['Solred']) return

  const rows = rowsFromSheet('Solred', 0)

  for (const row of rows) {
    const plate = normalizePlate(row['Matrícula'])
    if (!plate) continue

    const vehicleName = [asText(row['Marca']), asText(row['Modelo'])]
      .filter(Boolean)
      .join(' ') || null

    let { data: vehicle, error: findError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('plate', plate)
      .maybeSingle()

    if (findError) throw findError

    if (!vehicle) {
      const { data: newVehicle, error: insertError } = await supabase
        .from('vehicles')
        .insert({
          plate,
          vehicle_name: vehicleName,
          brand: asText(row['Marca']),
          model: asText(row['Modelo']),
          status: asBool(row['Activo']) ? 'activo' : 'baja'
        })
        .select()
        .single()

      if (insertError) throw insertError
      vehicle = newVehicle
    } else {
      const { data: updatedVehicle, error: updateError } = await supabase
        .from('vehicles')
        .update({
          vehicle_name: vehicle.vehicle_name || vehicleName,
          brand: vehicle.brand || asText(row['Marca']),
          model: vehicle.model || asText(row['Modelo']),
          status: asBool(row['Activo']) ? 'activo' : 'baja'
        })
        .eq('id', vehicle.id)
        .select()
        .single()

      if (updateError) throw updateError
      vehicle = updatedVehicle
    }

    const card = asText(row['Nº Tarjeta SOLRED'])
    if (!card) continue

    const payload = {
      vehicle_id: vehicle.id,
      card_number: card,
      fuel_type: asText(row['Combustible Habitual']),
      machinery_associated: asBool(row['Maquinaria Asociada']),
      active: asBool(row['Activo'])
    }

    const { error } = await supabase
      .from('solred_cards')
      .upsert(payload, { onConflict: 'card_number' })

    if (error) throw error
  }

  console.log('Importada hoja Solred')
}

await importRentingSheet('Renting', 'renting')
await importRentingSheet('Renting antiguo', 'renting antiguo')
await importPropios()
await importSolred()

console.log('Importación terminada')