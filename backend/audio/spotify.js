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

export async function searchTracks(query) {
  const token = await getToken()

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8&market=MX`
  const res  = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  const data = await res.json()

  return data.tracks.items.map(track => ({
    id:       track.id,
    name:     track.name,
    artist:   track.artists.map(a => a.name).join(', '),
    album:    track.album.name,
    image:    track.album.images[1]?.url ?? track.album.images[0]?.url ?? null,
    duration: Math.round(track.duration_ms / 1000)
  }))
}

export async function getAudioFeatures(trackId) {
  const token = await getToken()

  const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  return await res.json()
}