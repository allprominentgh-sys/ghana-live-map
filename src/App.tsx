
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap
} from "react-leaflet";
import L from "leaflet";

type Place = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string;
};

type RouteData = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  steps: {
    instruction: string;
    distanceMeters: number;
  }[];
};

const GHANA_CENTER: [number, number] = [7.9465, -1.0232];

function MapResize() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

function FitRoute({
  points
}: {
  points: [number, number][];
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(points, { padding: [35, 35] });
    }
  }, [map, points]);

  return null;
}

function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return `${hours} hr ${remainder} min`;
}

export default function App() {
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [startResults, setStartResults] = useState<Place[]>([]);
  const [endResults, setEndResults] = useState<Place[]>([]);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [mode, setMode] = useState("driving");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
    });
  }, []);

  async function searchPlaces(
    query: string,
    field: "start" | "end"
  ) {
    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }

    setError("");

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Place search failed.");
      }

      if (field === "start") {
        setStartResults(data.places);
        setEndResults([]);
      } else {
        setEndResults(data.places);
        setStartResults([]);
      }

      if (!data.places.length) {
        setError("No matching places found in Ghana.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to search."
      );
    }
  }

  function choosePlace(place: Place, field: "start" | "end") {
    if (field === "start") {
      setStart(place);
      setStartQuery(place.name);
      setStartResults([]);
    } else {
      setEnd(place);
      setEndQuery(place.name);
      setEndResults([]);
    }

    setRoute(null);
    setError("");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("GPS is not supported by this browser.");
      return;
    }

    setGpsLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place: Place = {
          id: "my-location",
          name: "My current location",
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          type: "gps"
        };

        if (
          place.lat < 4.5 ||
          place.lat > 11.2 ||
          place.lon < -3.5 ||
          place.lon > 1.5
        ) {
          setError("Your current location appears to be outside Ghana.");
          setGpsLoading(false);
          return;
        }

        setStart(place);
        setStartQuery("My current location");
        setRoute(null);
        setGpsLoading(false);
      },
      () => {
        setError(
          "Location access failed. Allow GPS permission and try again."
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function calculateRoute() {
    if (!start || !end) {
      setError("Select both a starting point and a destination.");
      return;
    }

    if (mode !== "driving") {
      setError(
        "Walking and public transport routing will be added in a later phase."
      );
      return;
    }

    setLoading(true);
    setError("");
    setRoute(null);

    try {
      const params = new URLSearchParams({
        startLat: String(start.lat),
        startLon: String(start.lon),
        endLat: String(end.lat),
        endLon: String(end.lon)
      });

      const response = await fetch(`/api/route?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Route calculation failed.");
      }

      setRoute(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to calculate your route."
      );
    } finally {
      setLoading(false);
    }
  }

  const routePoints: [number, number][] =
    route?.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    ) || [];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">GH</div>
        <div>
          <h1>Ghana Live Map</h1>
          <p>Find places. Plan your journey.</p>
        </div>
        <span className="ghana-tag">GHANA ONLY</span>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <h2>Plan your route</h2>
          <p className="muted">
            Search for streets, towns, landmarks and stations in Ghana.
          </p>

          <div className="field">
            <label htmlFor="start">Starting point</label>
            <div className="search-row">
              <input
                id="start"
                value={startQuery}
                onChange={(event) => {
                  setStartQuery(event.target.value);
                  setStart(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void searchPlaces(startQuery, "start");
                  }
                }}
                placeholder="e.g. Circle, Accra"
              />
              <button
                onClick={() => void searchPlaces(startQuery, "start")}
                aria-label="Search starting point"
              >
                Search
              </button>
            </div>
            <button
              className="gps-button"
              onClick={useMyLocation}
              disabled={gpsLoading}
            >
              {gpsLoading ? "Finding location..." : "◎ Use my GPS location"}
            </button>

            {startResults.length > 0 && (
              <div className="results">
                {startResults.map((place) => (
                  <button
                    className="result"
                    key={place.id}
                    onClick={() => choosePlace(place, "start")}
                  >
                    {place.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="end">Destination</label>
            <div className="search-row">
              <input
                id="end"
                value={endQuery}
                onChange={(event) => {
                  setEndQuery(event.target.value);
                  setEnd(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void searchPlaces(endQuery, "end");
                  }
                }}
                placeholder="e.g. Kotoka Airport"
              />
              <button
                onClick={() => void searchPlaces(endQuery, "end")}
                aria-label="Search destination"
              >
                Search
              </button>
            </div>

            {endResults.length > 0 && (
              <div className="results">
                {endResults.map((place) => (
                  <button
                    className="result"
                    key={place.id}
                    onClick={() => choosePlace(place, "end")}
                  >
                    {place.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="mode">Travel method</label>
            <select
              id="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="driving">Driving</option>
              <option value="walking">Walking (coming soon)</option>
              <option value="transit">Public transport (coming soon)</option>
            </select>
          </div>

          <button
            className="route-button"
            onClick={() => void calculateRoute()}
            disabled={loading}
          >
            {loading ? "Calculating route..." : "Find route"}
          </button>

          {error && <p className="error-message">{error}</p>}

          {route && (
            <section className="route-summary">
              <h3>Route estimate</h3>
              <div className="stats">
                <div>
                  <strong>{formatDistance(route.distanceMeters)}</strong>
                  <span>Distance</span>
                </div>
                <div>
                  <strong>{formatDuration(route.durationSeconds)}</strong>
                  <span>Estimated time</span>
                </div>
              </div>
              <p className="muted small">
                Estimates can differ from real travel times and traffic.
              </p>
              <h3>Route steps</h3>
              <ol className="steps">
                {route.steps.slice(0, 12).map((step, index) => (
                  <li key={`${index}-${step.instruction}`}>
                    {step.instruction}
                    <span>{formatDistance(step.distanceMeters)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="disclaimer">
            Map data © OpenStreetMap contributors. Route estimates use the
            public OSRM demo service.
          </p>
        </aside>

        <section className="map-panel" aria-label="Map of Ghana">
          <MapContainer
            center={GHANA_CENTER}
            zoom={7}
            minZoom={5}
            maxZoom={19}
            scrollWheelZoom
            className="map"
          >
            <MapResize />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {start && (
              <Marker position={[start.lat, start.lon]}>
                <Popup>Starting point: {start.name}</Popup>
              </Marker>
            )}

            {end && (
              <Marker position={[end.lat, end.lon]}>
                <Popup>Destination: {end.name}</Popup>
              </Marker>
            )}

            {routePoints.length > 0 && (
              <>
                <Polyline
                  positions={routePoints}
                  pathOptions={{ color: "#155eef", weight: 5 }}
                />
                <FitRoute points={routePoints} />
              </>
            )}
          </MapContainer>

          <div className="map-label">
            <span className="live-dot" />
            Ghana map
          </div>
        </section>
      </section>
    </main>
  );
}
