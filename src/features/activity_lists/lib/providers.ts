export type ActivityType = 'movie' | 'series' | 'place' | 'book'
export type ActivitySource = 'tmdb' | 'openlibrary' | 'photon' | 'manual'

export interface SearchResult {
  externalId: string
  externalSource: ActivitySource
  type: ActivityType
  title: string
  subtitle: string
  imageUrl: string | null
  meta: Record<string, unknown>
}

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500'

function getTmdbKey(): string | null {
  const key = import.meta.env.VITE_TMDB_API_KEY
  return key && String(key).trim() ? String(key).trim() : null
}

async function searchTmdb(
  type: 'movie' | 'series',
  query: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const apiKey = getTmdbKey()
  if (!apiKey) {
    throw new Error('TMDB_KEY_MISSING')
  }

  const path = type === 'movie' ? 'search/movie' : 'search/tv'
  const url = `${TMDB_BASE}/${path}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&language=tr-TR&include_adult=false&page=1`

  const res = await fetch(url,{signal})
  if (!res.ok) throw new Error('TMDB_SEARCH_FAILED')
  const data = await res.json()
  const results = Array.isArray(data.results) ? data.results : []

  return results.slice(0, 12).map((item: Record<string, unknown>) => {
    const title =
      type === 'movie'
        ? String(item.title || item.original_title || 'Untitled')
        : String(item.name || item.original_name || 'Untitled')
    const date =
      type === 'movie'
        ? String(item.release_date || '')
        : String(item.first_air_date || '')
    const year = date.slice(0, 4)
    const poster = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null

    return {
      externalId: String(item.id),
      externalSource: 'tmdb' as const,
      type,
      title,
      subtitle: year || (type === 'movie' ? 'Film' : 'Dizi'),
      imageUrl: poster,
      meta: {
        voteAverage: item.vote_average,
        overview: item.overview,
        originalTitle:
          type === 'movie' ? item.original_title : item.original_name,
      },
    }
  })
}

async function searchBooks(query: string,signal?:AbortSignal): Promise<SearchResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,edition_count`

  const res = await fetch(url,{signal})
  if (!res.ok) throw new Error('OPENLIBRARY_SEARCH_FAILED')
  const data = await res.json()
  const docs = Array.isArray(data.docs) ? data.docs : []

  return docs.map((doc: Record<string, unknown>) => {
    const authors = Array.isArray(doc.author_name)
      ? (doc.author_name as string[]).slice(0, 2).join(', ')
      : ''
    const year = doc.first_publish_year ? String(doc.first_publish_year) : ''
    const coverId = doc.cover_i
    const imageUrl = coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
      : null
    const key = String(doc.key || '')

    return {
      externalId: key || String(doc.title),
      externalSource: 'openlibrary' as const,
      type: 'book' as const,
      title: String(doc.title || 'Untitled'),
      subtitle: [authors, year].filter(Boolean).join(' · ') || 'Kitap',
      imageUrl,
      meta: {
        authors: doc.author_name,
        firstPublishYear: doc.first_publish_year,
        editionCount: doc.edition_count,
      },
    }
  })
}

async function fetchWikipediaThumb(title: string,signal?:AbortSignal): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const res = await fetch(url,{signal})
    if (!res.ok) return null
    const data = await res.json()
    return data?.thumbnail?.source || data?.originalimage?.source || null
  } catch {
    return null
  }
}

async function searchPlaces(query: string,signal?:AbortSignal): Promise<SearchResult[]> {
  // Photon (Komoot) — browser-friendly geocoder, no API key
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10`

  const res = await fetch(url,{signal})
  if (!res.ok) throw new Error('PHOTON_SEARCH_FAILED')
  const data = await res.json()
  const features = Array.isArray(data.features) ? data.features : []

  const mapped = await Promise.all(
    features.map(async (feature: Record<string, unknown>, index: number) => {
      const props = (feature.properties || {}) as Record<string, unknown>
      const name = String(props.name || props.street || props.city || 'Place')
      const parts = [props.city, props.state, props.country].filter(Boolean).map(String)
      const subtitle = parts.join(', ') || String(props.type || 'place')
      const osmId = props.osm_id != null ? String(props.osm_id) : `photon-${index}-${name}`
      const coords = Array.isArray((feature as { geometry?: { coordinates?: number[] } }).geometry?.coordinates)
        ? (feature as { geometry: { coordinates: number[] } }).geometry.coordinates
        : null
      const imageUrl = await fetchWikipediaThumb(name,signal)

      return {
        externalId: osmId,
        externalSource: 'photon' as const,
        type: 'place' as const,
        title: name,
        subtitle,
        imageUrl,
        meta: {
          lat: coords?.[1],
          lon: coords?.[0],
          osmType: props.osm_type,
          placeType: props.type,
          fullName: [name, ...parts].join(', '),
        },
      }
    })
  )

  return mapped
}

export async function searchActivities(
  type: ActivityType,
  query: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  switch (type) {
    case 'movie':
      return searchTmdb('movie', q,signal)
    case 'series':
      return searchTmdb('series', q,signal)
    case 'book':
      return searchBooks(q,signal)
    case 'place':
      return searchPlaces(q,signal)
    default:
      return []
  }
}

export function isTmdbConfigured(): boolean {
  return Boolean(getTmdbKey())
}
