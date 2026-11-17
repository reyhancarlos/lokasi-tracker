import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Peta OpenStreetMap. Titik posisi dan garis rute digambar manual pakai Leaflet
// supaya tidak butuh file gambar marker tambahan.
export default function MapView({ point, trail = [], follow = true, fit = false }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const lineRef = useRef(null)
  const hasFitRef = useRef(false)

  // Bikin peta sekali saja saat komponen muncul.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined
    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    map.setView([-6.9733, 107.6309], 12) // tampilan awal: Bandung
    mapRef.current = map
    const timer = setTimeout(() => map.invalidateSize(), 150)
    return () => {
      clearTimeout(timer)
      map.remove()
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
      lineRef.current = null
      hasFitRef.current = false
    }
  }, [])

  // Gambar ulang garis rute setiap ada titik baru.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const latlngs = trail.map((p) => [p.lat, p.lon])
    if (latlngs.length > 1) {
      if (!lineRef.current) {
        lineRef.current = L.polyline(latlngs, { color: '#2563eb', weight: 4 }).addTo(map)
      } else {
        lineRef.current.setLatLngs(latlngs)
      }
      if (fit && !hasFitRef.current) {
        map.fitBounds(lineRef.current.getBounds(), { padding: [30, 30] })
        hasFitRef.current = true
      }
    } else if (lineRef.current) {
      lineRef.current.remove()
      lineRef.current = null
    }
  }, [trail, fit])

  // Pindahkan titik posisi dan lingkaran akurasi.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !point) return
    const latlng = [point.lat, point.lon]

    if (!markerRef.current) {
      markerRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).addTo(map)
    } else {
      markerRef.current.setLatLng(latlng)
    }

    const accuracy = Number(point.accuracy)
    if (Number.isFinite(accuracy) && accuracy > 0) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: accuracy,
          color: '#2563eb',
          weight: 1,
          fillOpacity: 0.12,
        }).addTo(map)
      } else {
        circleRef.current.setLatLng(latlng)
        circleRef.current.setRadius(accuracy)
      }
    }

    if (follow) {
      map.setView(latlng, Math.max(map.getZoom(), 16), { animate: true })
    }
  }, [point, follow])

  return <div className="map" ref={containerRef} />
}
