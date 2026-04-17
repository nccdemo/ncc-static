import L from 'leaflet'

function hueForDriver(driverId) {
  return (Math.abs(Number(driverId)) * 47) % 360
}

/**
 * Top-down car silhouette as a Leaflet divIcon (crisp on retina, hue per driver).
 */
export function createDriverCarIcon(driverId) {
  const hue = hueForDriver(driverId)
  const fill = `hsl(${hue} 72% 48%)`
  const roof = `hsl(${hue} 35% 22%)`
  const glass = 'rgba(255,255,255,0.35)'

  const html = `
    <div class="ncc-car-marker" style="width:40px;height:40px;transform:translate(-50%,-50%)">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <filter id="carshadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.45)"/>
          </filter>
        </defs>
        <ellipse cx="20" cy="28" rx="11" ry="5.5" fill="${fill}" filter="url(#carshadow)" opacity="0.95"/>
        <rect x="8" y="12" width="24" height="16" rx="3.5" fill="${fill}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
        <path d="M12 18h16" stroke="${glass}" stroke-width="1.2" stroke-linecap="round"/>
        <rect x="13" y="13" width="14" height="5" rx="1.5" fill="${roof}"/>
        <rect x="15" y="8" width="10" height="6" rx="2" fill="${roof}" stroke="rgba(255,255,255,0.12)" stroke-width="0.75"/>
      </svg>
    </div>
  `

  return L.divIcon({
    className: 'ncc-leaflet-car-icon',
    html,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -18],
  })
}

export function createPinIcon({ color, label }) {
  const html = `
    <div class="ncc-pin-marker" style="--pin:${color}" title="${label}">
      <svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.82 0 1 5.48 1 12.2 1 20.5 14 34 14 34s13-13.5 13-21.8C27 5.48 21.18 0 14 0z" fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"/>
        <circle cx="14" cy="12" r="4" fill="rgba(255,255,255,0.95)"/>
      </svg>
    </div>
  `
  return L.divIcon({
    className: 'ncc-leaflet-pin-icon',
    html,
    iconSize: [28, 34],
    iconAnchor: [14, 32],
    popupAnchor: [0, -28],
  })
}
