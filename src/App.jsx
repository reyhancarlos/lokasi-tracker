import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import MapView from './components/MapView'
import {
  formatCoord,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatSpeed,
  formatTime,
  haversine,
  loadSessions,
  saveSessions,
  totalDistance,
} from './lib/geo'

// Titik baru hanya masuk rute kalau jaraknya cukup jauh dan akurasinya wajar,
// supaya garis rute tidak zig-zag karena sinyal GPS yang goyang.
const JARAK_MINIMUM = 5 // meter
const AKURASI_MAKSIMUM = 100 // meter

export default function App() {
  const [tab, setTab] = useState('lacak')
  const [posisi, setPosisi] = useState(null)
  const [rute, setRute] = useState([])
  const [melacak, setMelacak] = useState(false)
  const [memuat, setMemuat] = useState(false)
  const [pesan, setPesan] = useState('')
  const [error, setError] = useState('')
  const [ikuti, setIkuti] = useState(true)
  const [mulaiPada, setMulaiPada] = useState(null)
  const [sekarang, setSekarang] = useState(() => Date.now())
  const [kecepatanMaks, setKecepatanMaks] = useState(0)
  const [sesi, setSesi] = useState(() => loadSessions())
  const [sesiDibuka, setSesiDibuka] = useState(null)

  const watchIdRef = useRef(null)
  const ruteRef = useRef([])

  useEffect(() => {
    ruteRef.current = rute
  }, [rute])

  // Timer untuk menghitung durasi pelacakan.
  useEffect(() => {
    if (!melacak) return undefined
    const timer = setInterval(() => setSekarang(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [melacak])

  // Pastikan watcher mati kalau aplikasi ditutup.
  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {})
      }
    }
  }, [])

  const jarak = useMemo(() => totalDistance(rute), [rute])
  const durasi = useMemo(() => {
    if (!mulaiPada) return 0
    const akhir = melacak ? sekarang : rute.at(-1)?.timestamp ?? sekarang
    return akhir - mulaiPada
  }, [mulaiPada, melacak, sekarang, rute])

  const kecepatanRata = durasi > 0 ? jarak / (durasi / 1000) : 0

  const simpanTitik = useCallback((coords, timestamp) => {
    const titik = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy ?? null,
      altitude: coords.altitude ?? null,
      speed: coords.speed ?? null,
      timestamp: timestamp ?? Date.now(),
    }

    const terakhir = ruteRef.current.at(-1)
    let kecepatan = Number.isFinite(titik.speed) && titik.speed !== null ? titik.speed : null

    // Kalau HP tidak mengirim data kecepatan, hitung sendiri dari jarak dibagi waktu.
    if (kecepatan === null && terakhir) {
      const detik = (titik.timestamp - terakhir.timestamp) / 1000
      if (detik > 0) kecepatan = haversine(terakhir, titik) / detik
    }
    titik.speed = kecepatan

    setPosisi(titik)
    if (Number.isFinite(kecepatan) && kecepatan > 0) {
      setKecepatanMaks((prev) => Math.max(prev, kecepatan))
    }
    return titik
  }, [])

  const tambahKeRute = useCallback((titik) => {
    const akurasiBuruk = Number.isFinite(titik.accuracy) && titik.accuracy > AKURASI_MAKSIMUM
    if (akurasiBuruk) return
    setRute((prev) => {
      const terakhir = prev.at(-1)
      if (terakhir && haversine(terakhir, titik) < JARAK_MINIMUM) return prev
      return [...prev, titik]
    })
  }, [])

  const mintaIzin = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return true
    const status = await Geolocation.checkPermissions()
    if (status.location === 'granted' || status.coarseLocation === 'granted') return true
    const hasil = await Geolocation.requestPermissions({ permissions: ['location'] })
    return hasil.location === 'granted' || hasil.coarseLocation === 'granted'
  }, [])

  const ambilLokasi = useCallback(async () => {
    setError('')
    setPesan('')
    setMemuat(true)
    try {
      const diizinkan = await mintaIzin()
      if (!diizinkan) {
        setError('Izin lokasi ditolak. Aktifkan lewat Pengaturan aplikasi.')
        return
      }
      const hasil = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      })
      const titik = simpanTitik(hasil.coords, hasil.timestamp)
      setPesan(`Lokasi diperbarui ${formatTime(titik.timestamp)}`)
    } catch (e) {
      setError(bacaError(e))
    } finally {
      setMemuat(false)
    }
  }, [mintaIzin, simpanTitik])

  const mulaiLacak = useCallback(async () => {
    setError('')
    setPesan('')
    setMemuat(true)
    try {
      const diizinkan = await mintaIzin()
      if (!diizinkan) {
        setError('Izin lokasi ditolak. Aktifkan lewat Pengaturan aplikasi.')
        return
      }
      setRute([])
      ruteRef.current = []
      setKecepatanMaks(0)
      setMulaiPada(Date.now())
      setSekarang(Date.now())

      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
        (hasil, err) => {
          if (err) {
            setError(bacaError(err))
            return
          }
          if (!hasil) return
          const titik = simpanTitik(hasil.coords, hasil.timestamp)
          tambahKeRute(titik)
        },
      )
      watchIdRef.current = id
      setMelacak(true)
      setPesan('Pelacakan jalan. Jaga aplikasi tetap terbuka.')
    } catch (e) {
      setError(bacaError(e))
    } finally {
      setMemuat(false)
    }
  }, [mintaIzin, simpanTitik, tambahKeRute])

  const stopLacak = useCallback(async () => {
    if (watchIdRef.current) {
      await Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {})
      watchIdRef.current = null
    }
    setMelacak(false)

    const titikRute = ruteRef.current
    if (titikRute.length > 1 && mulaiPada) {
      const baru = {
        id: String(Date.now()),
        startedAt: mulaiPada,
        endedAt: titikRute.at(-1).timestamp,
        points: titikRute.slice(0, 2000),
        distance: totalDistance(titikRute),
        duration: titikRute.at(-1).timestamp - mulaiPada,
        maxSpeed: kecepatanMaks,
      }
      const daftar = [baru, ...sesi]
      setSesi(daftar)
      saveSessions(daftar)
      setPesan(`Rute tersimpan ke Riwayat (${formatDistance(baru.distance)}).`)
    } else {
      setPesan('Pelacakan dihentikan. Titiknya belum cukup untuk disimpan.')
    }
  }, [mulaiPada, kecepatanMaks, sesi])

  const reset = useCallback(() => {
    setRute([])
    ruteRef.current = []
    setPosisi(null)
    setMulaiPada(null)
    setKecepatanMaks(0)
    setPesan('')
    setError('')
  }, [])

  const hapusSesi = useCallback(
    (id) => {
      const daftar = sesi.filter((s) => s.id !== id)
      setSesi(daftar)
      saveSessions(daftar)
      if (sesiDibuka?.id === id) setSesiDibuka(null)
    },
    [sesi, sesiDibuka],
  )

  const hapusSemuaSesi = useCallback(() => {
    setSesi([])
    saveSessions([])
    setSesiDibuka(null)
  }, [])

  const salinKoordinat = useCallback(async () => {
    if (!posisi) return
    const teks = `${posisi.lat}, ${posisi.lon}`
    try {
      await navigator.clipboard.writeText(teks)
      setPesan('Koordinat tersalin.')
    } catch {
      setPesan(`Koordinat: ${teks}`)
    }
  }, [posisi])

  const linkMaps = posisi
    ? `https://www.google.com/maps/search/?api=1&query=${posisi.lat},${posisi.lon}`
    : null

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Lokasi Tracker</h1>
          <p className="subtitle">Pantau posisi dan rekam rute perjalanan</p>
        </div>
        <span className={melacak ? 'badge badge-on' : 'badge'}>
          {melacak ? 'Melacak' : 'Siaga'}
        </span>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={tab === 'lacak' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('lacak')}
        >
          Lacak
        </button>
        <button
          type="button"
          className={tab === 'riwayat' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('riwayat')}
        >
          Riwayat ({sesi.length})
        </button>
      </nav>

      {tab === 'lacak' && (
        <main className="content">
          <MapView point={posisi} trail={rute} follow={ikuti} />

          <label className="follow">
            <input
              type="checkbox"
              checked={ikuti}
              onChange={(e) => setIkuti(e.target.checked)}
            />
            Peta mengikuti posisi
          </label>

          <div className="actions">
            <button type="button" className="btn" onClick={ambilLokasi} disabled={memuat || melacak}>
              {memuat && !melacak ? 'Mencari...' : 'Ambil Lokasi'}
            </button>
            {melacak ? (
              <button type="button" className="btn btn-stop" onClick={stopLacak}>
                Stop dan Simpan
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={mulaiLacak} disabled={memuat}>
                Mulai Lacak
              </button>
            )}
          </div>

          {error && <p className="alert alert-error">{error}</p>}
          {!error && pesan && <p className="alert">{pesan}</p>}

          <section className="stats">
            <Stat label="Jarak tempuh" value={formatDistance(jarak)} />
            <Stat label="Durasi" value={formatDuration(durasi)} />
            <Stat label="Kecepatan" value={formatSpeed(posisi?.speed)} />
            <Stat label="Kec. maksimum" value={formatSpeed(kecepatanMaks)} />
            <Stat label="Kec. rata-rata" value={formatSpeed(kecepatanRata)} />
            <Stat label="Jumlah titik" value={String(rute.length)} />
          </section>

          <section className="card">
            <h2>Detail posisi</h2>
            <Row label="Latitude" value={formatCoord(posisi?.lat)} />
            <Row label="Longitude" value={formatCoord(posisi?.lon)} />
            <Row
              label="Akurasi"
              value={posisi?.accuracy ? `${posisi.accuracy.toFixed(0)} m` : '-'}
            />
            <Row
              label="Ketinggian"
              value={Number.isFinite(posisi?.altitude) ? `${posisi.altitude.toFixed(0)} m` : '-'}
            />
            <Row label="Pembaruan terakhir" value={formatTime(posisi?.timestamp)} />
          </section>

          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={salinKoordinat} disabled={!posisi}>
              Copy koordinat
            </button>
            <a
              className={posisi ? 'btn btn-ghost' : 'btn btn-ghost btn-disabled'}
              href={linkMaps ?? '#'}
              target="_blank"
              rel="noreferrer"
            >
              Buka di Google Maps
            </a>
          </div>

          <button type="button" className="link-btn" onClick={reset} disabled={melacak}>
            Reset tampilan
          </button>
        </main>
      )}

      {tab === 'riwayat' && (
        <main className="content">
          {sesiDibuka ? (
            <>
              <button type="button" className="link-btn" onClick={() => setSesiDibuka(null)}>
                Kembali ke daftar
              </button>
              <MapView
                point={sesiDibuka.points.at(-1)}
                trail={sesiDibuka.points}
                follow={false}
                fit
              />
              <section className="stats">
                <Stat label="Jarak" value={formatDistance(sesiDibuka.distance)} />
                <Stat label="Durasi" value={formatDuration(sesiDibuka.duration)} />
                <Stat label="Kec. maksimum" value={formatSpeed(sesiDibuka.maxSpeed)} />
                <Stat label="Titik" value={String(sesiDibuka.points.length)} />
              </section>
              <section className="card">
                <h2>Waktu</h2>
                <Row label="Mulai" value={formatDateTime(sesiDibuka.startedAt)} />
                <Row label="Selesai" value={formatDateTime(sesiDibuka.endedAt)} />
                <Row
                  label="Titik awal"
                  value={`${formatCoord(sesiDibuka.points[0]?.lat)}, ${formatCoord(sesiDibuka.points[0]?.lon)}`}
                />
                <Row
                  label="Titik akhir"
                  value={`${formatCoord(sesiDibuka.points.at(-1)?.lat)}, ${formatCoord(sesiDibuka.points.at(-1)?.lon)}`}
                />
              </section>
            </>
          ) : (
            <>
              {sesi.length === 0 && (
                <p className="empty">
                  Belum ada rute tersimpan. Tekan Mulai Lacak di tab Lacak, jalan sebentar,
                  lalu tekan Stop dan Simpan.
                </p>
              )}
              {sesi.map((s) => (
                <article key={s.id} className="history">
                  <div className="history-head">
                    <strong>{formatDateTime(s.startedAt)}</strong>
                    <button type="button" className="delete" onClick={() => hapusSesi(s.id)}>
                      Hapus
                    </button>
                  </div>
                  <p className="history-meta">
                    {formatDistance(s.distance)} | {formatDuration(s.duration)} |{' '}
                    {s.points.length} titik
                  </p>
                  <button type="button" className="btn btn-ghost" onClick={() => setSesiDibuka(s)}>
                    Lihat rute di peta
                  </button>
                </article>
              ))}
              {sesi.length > 0 && (
                <button type="button" className="link-btn danger" onClick={hapusSemuaSesi}>
                  Hapus semua riwayat
                </button>
              )}
            </>
          )}
        </main>
      )}

      <footer className="footer">
        Data lokasi hanya disimpan di HP ini, tidak dikirim ke server mana pun.
      </footer>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  )
}

// Ubah pesan error teknis jadi bahasa yang gampang dipahami.
function bacaError(e) {
  const pesan = String(e?.message ?? e)
  if (/denied|permission/i.test(pesan)) {
    return 'Izin lokasi ditolak. Aktifkan izin lokasi untuk aplikasi ini.'
  }
  if (/timeout/i.test(pesan)) {
    return 'Sinyal GPS lambat. Coba keluar ruangan lalu ulangi.'
  }
  if (/unavailable|position/i.test(pesan)) {
    return 'Lokasi tidak tersedia. Pastikan GPS atau layanan lokasi sudah menyala.'
  }
  return `Gagal mengambil lokasi: ${pesan}`
}
