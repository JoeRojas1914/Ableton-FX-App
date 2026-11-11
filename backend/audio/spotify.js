import fetch from 'node-fetch'

let tokenCache  = null
let tokenExpiry = 0

async function getToken() {
  if (tokenCache && Date.now() < tokenExpiry) return tokenCache

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')

  const res  = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })

  const data  = await res.json()
  tokenCache  = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return tokenCache
}

export const PAGE_SIZE = 10
const MAX_RESULTS     = 1000   // Spotify no deja pasar de offset + limit = 1000

export async function searchTracks(query, page = 0) {
  const token  = await getToken()
  const offset = page * PAGE_SIZE

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}` +
              `&type=track&limit=${PAGE_SIZE}&offset=${offset}&market=MX`
  const res  = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Spotify respondió ${res.status}`)

  const items = data.tracks?.items ?? []

  const tracks = items.map(track => ({
    id:       track.id,
    name:     track.name,
    artist:   track.artists.map(a => a.name).join(', '),
    artistId: track.artists[0]?.id ?? null,
    album:    track.album.name,
    image:    track.album.images[1]?.url ?? track.album.images[0]?.url ?? null,
    duration: Math.round(track.duration_ms / 1000)
  }))

  return {
    tracks,
    page,
    // "total" y "next" de Spotify no son fiables (subestiman y se corrigen al avanzar):
    // si la página vino llena, asumimos que hay otra
    hasNext: items.length === PAGE_SIZE && offset + PAGE_SIZE < MAX_RESULTS
  }
}