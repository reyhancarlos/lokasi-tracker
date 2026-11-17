// Kumpulan fungsi bantu: hitung jarak, format tampilan, dan simpan riwayat.

const STORAGE_KEY = 'lokasi-tracker-sesi'

// Rumus Haversine: jarak dua koordinat di permukaan bumi, satuannya meter.
export function haversine(a, b) {
  const R = 6371000 // radius bumi dalam meter
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Total jarak satu rute (jumlah jarak antar titik yang berurutan).
export function totalDistance(points) {
  let sum = 0
  for (let i = 1; i < points.length; i += 1) {
    sum += haversine(points[i - 1], points[i])
  }
  return sum
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '-'
  if (meters < 1000) return `${meters.toFixed(0)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00:00'
  const total = Math.floor(ms / 1000)
  const jam = String(Math.floor(total / 3600)).padStart(2, '0')
  const menit = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const detik = String(total % 60).padStart(2, '0')
  return `${jam}:${menit}:${detik}`
}

export function formatSpeed(metersPerSecond) {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond < 0) return '-'
  return `${(metersPerSecond * 3.6).toFixed(1)} km/jam`
}

export function formatCoord(value) {
  if (!Number.isFinite(value)) return '-'
  return value.toFixed(6)
}

export function formatTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('id-ID')
}

export function formatDateTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Riwayat disimpan di localStorage biar tidak hilang waktu aplikasi ditutup.
export function loadSessions() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function saveSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // kalau penyimpanan penuh, biarkan saja supaya aplikasi tidak crash
  }
}
