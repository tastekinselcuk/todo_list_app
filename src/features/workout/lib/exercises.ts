export interface CatalogExercise {
  id: string
  name: string
  equipment: string | null
  primaryMuscles: string[]
  category: string
  images: string[]
}

export interface ExerciseInput {
  name: string
  sets: number
  reps: string
  imageUrl: string
  catalogId?: string
  images?: string[]
  equipment?: string
  muscles?: string[]
  weightKg?: number | null
  restSeconds?: number | null
  tempo?: string
  alternative?: string
  notes?: string
}

export const muscleGroups = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'] as const
export const equipmentTypes = ['body only', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebells', 'bands', 'medicine ball', 'exercise ball', 'foam roll', 'e-z curl bar', 'other'] as const
const groups: Record<string, string[]> = {
  chest: ['chest'], back: ['lats', 'middle back', 'lower back', 'traps', 'neck'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  shoulders: ['shoulders'], arms: ['biceps', 'triceps', 'forearms'], core: ['abdominals'],
}
const aliases: Record<string, string> = {
  chest: 'göğüs gogus', lats: 'sırt sirt kanat', 'middle back': 'sırt sirt', 'lower back': 'bel sırt sirt',
  traps: 'trapez sırt sirt', shoulders: 'omuz', biceps: 'pazu ön kol on kol', triceps: 'arka kol',
  forearms: 'önkol bilek', quadriceps: 'bacak ön bacak', hamstrings: 'arka bacak', glutes: 'kalça kalca',
  calves: 'baldır baldir', adductors: 'iç bacak ic bacak', abductors: 'dış bacak dis bacak', abdominals: 'karın karin core',
  'body only': 'vücut ağırlığı vucut agirligi ekipmansız ekipmansiz', dumbbell: 'dambıl dambil dumbell',
  barbell: 'bar halter', cable: 'kablo makara', machine: 'makine', kettlebells: 'kettlebell', bands: 'lastik bant',
  cardio: 'kardiyo koşu kosu', 'push up': 'şınav sinav', pushups: 'şınav sinav', 'pull up': 'barfiks', pullups: 'barfiks', squat: 'çömelme comelme',
}
const legacyNames: Record<string, string> = {
  'barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  'barbell squat': 'Barbell_Full_Squat', 'push up': 'Pushups', 'push-up': 'Pushups',
  'dumbbell biceps curl': 'Dumbbell_Bicep_Curl', 'dumbbell incline bench press': 'Incline_Dumbbell_Press',
  'barbell deadlift': 'Barbell_Deadlift', 'pull up': 'Pullups',
}
export const fold = (value: string) => value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim()
let catalogPromise: Promise<CatalogExercise[]> | undefined
const popular = ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Full_Squat', 'Barbell_Deadlift', 'Pushups', 'Pullups', 'Dumbbell_Bicep_Curl', 'Dumbbell_Shoulder_Press', 'Wide-Grip_Lat_Pulldown', 'Leg_Press', 'Plank', 'Incline_Dumbbell_Press', 'Seated_Cable_Rows']
export function loadExerciseCatalog() {
  return catalogPromise ??= import('../data/catalog.json').then(data => [...data.default as CatalogExercise[]].sort((a, b) => {
    const left = popular.indexOf(a.id), right = popular.indexOf(b.id)
    return (left < 0 ? popular.length : left) - (right < 0 ? popular.length : right)
  })).catch(error => { catalogPromise = undefined; throw error })
}
export function exerciseGroup(exercise: CatalogExercise, group: string) {
  return !group || group === 'all' || (group === 'cardio' ? exercise.category === 'cardio' : exercise.primaryMuscles.some(muscle => groups[group]?.includes(muscle)))
}
const searchTexts = new WeakMap<CatalogExercise, string>()
function searchText(exercise: CatalogExercise) {
  const cached = searchTexts.get(exercise)
  if (cached) return cached
  const fields = [exercise.name, exercise.equipment || '', exercise.category, ...exercise.primaryMuscles]
  const name = fold(exercise.name)
  const text = fold(fields.join(' ') + ' ' + fields.map(field => aliases[field] || '').join(' ') + ' ' + Object.entries(aliases).filter(([key]) => name.includes(key)).map(([, value]) => value).join(' '))
  searchTexts.set(exercise, text)
  return text
}
export function searchCatalog(catalog: CatalogExercise[], query: string, group = 'all', equipment = 'all') {
  const tokens = fold(query).split(' ').filter(Boolean)
  return catalog.filter(exercise => {
    if (!exerciseGroup(exercise, group) || (equipment !== 'all' && exercise.equipment !== equipment)) return false
    if (!tokens.length) return true
    const text = searchText(exercise)
    return tokens.every(token => text.includes(token))
  })
}
const indexes = new WeakMap<CatalogExercise[], { ids: Map<string, CatalogExercise>; names: Map<string, CatalogExercise> }>()
export function matchCatalogExercise(catalog: CatalogExercise[], exercise: { name: string; catalogId?: string }) {
  let index = indexes.get(catalog)
  if (!index) {
    index = { ids: new Map(catalog.map(item => [item.id, item])), names: new Map(catalog.map(item => [fold(item.name), item])) }
    indexes.set(catalog, index)
  }
  const name = fold(exercise.name)
  return index.ids.get(exercise.catalogId || '') || index.names.get(name) || index.ids.get(legacyNames[name])
}
export function safeImageUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '' } catch { return '' }
}
export function catalogImageUrl(path: string, mirror = false) {
  // Only dataset-relative image paths can be joined to the public host.
  if (!/^[a-zA-Z0-9_().-]+\/[01]\.jpg$/.test(path)) return ''
  const base = mirror ? 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/' : 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
  return base + path.split('/').map(encodeURIComponent).join('/')
}
export function imageCandidates(exercise: ExerciseInput, catalog: CatalogExercise[], pose = 0) {
  const match = matchCatalogExercise(catalog, exercise)
  const paths = match?.images || []
  const remote = exercise.images?.[pose] || (pose === 0 ? exercise.imageUrl : '')
  // Repair old expiring ExerciseDB URLs with a matching catalog entry first.
  const matches = [catalogImageUrl(paths[pose] || paths[0] || ''), catalogImageUrl(paths[pose] || paths[0] || '', true)]
  const custom = !exercise.catalogId && remote && !/exercisedb|rapidapi/i.test(remote)
  const candidates = custom ? [safeImageUrl(remote), ...matches] : [...matches, safeImageUrl(remote)]
  return [...new Set(candidates.filter(Boolean))]
}
export function catalogInput(exercise: CatalogExercise): ExerciseInput {
  return { name: exercise.name, catalogId: exercise.id, imageUrl: catalogImageUrl(exercise.images[0] || ''),
    images: exercise.images.map(path => catalogImageUrl(path)).filter(Boolean), equipment: exercise.equipment || '', muscles: exercise.primaryMuscles,
    sets: 3, reps: '10–12', weightKg: null, restSeconds: 90, tempo: '', alternative: '', notes: '' }
}
export function normalizeExerciseInput(input: ExerciseInput): ExerciseInput {
  const name = input.name.trim(), reps = input.reps.trim()
  if (!name || name.length > 160 || !reps || reps.length > 40 || !Number.isInteger(input.sets) || input.sets < 1 || input.sets > 100) throw new Error('INVALID_EXERCISE')
  for (const [value, max] of [[input.weightKg, 1000], [input.restSeconds, 3600]] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0 || value > max)) throw new Error('INVALID_EXERCISE')
  }
  return { name, reps, sets: input.sets, imageUrl: safeImageUrl(input.imageUrl),
    catalogId: input.catalogId || '', images: (input.images || []).map(safeImageUrl).filter(Boolean).slice(0, 2),
    equipment: (input.equipment || '').slice(0, 80), muscles: (input.muscles || []).slice(0, 6),
    weightKg: input.weightKg ?? null, restSeconds: input.restSeconds ?? null,
    tempo: (input.tempo || '').trim().slice(0, 24), alternative: (input.alternative || '').trim().slice(0, 160), notes: (input.notes || '').trim().slice(0, 1000) }
}
