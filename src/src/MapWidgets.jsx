// Split out from App.jsx so react-leaflet + leaflet (a genuinely heavy
// dependency — the JS lib, its CSS, and the marker image assets) land in
// their own lazy-loaded chunk instead of the main bundle. Most visits to
// VaiBook never open a map (a customer just browsing services, a provider
// managing bookings) — this file is only fetched the moment someone opens
// a provider's location tab or the provider's own location-picker in
// Settings. See the two `React.lazy(() => import("./MapWidgets")...)`
// call sites in App.jsx.
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icons reference image paths that don't resolve
// correctly under CRA's bundler unless re-pointed at the imported assets.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function LocationPicker({ position, onPick }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position ? <Marker position={position} /> : null;
}

// Read-only map — a customer viewing a provider's profile.
export function ProviderMiniMap({ lat, lng, height = 200 }) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} style={{ height, width: "100%" }} scrollWheelZoom={false} dragging={false} doubleClickZoom={false} zoomControl={false} attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]} />
    </MapContainer>
  );
}

// Editable map — the provider dropping/moving their own pin in Settings.
export function ProviderLocationMap({ center, zoom, position, onPick, height = 260 }) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height, width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <LocationPicker position={position} onPick={onPick} />
    </MapContainer>
  );
}
