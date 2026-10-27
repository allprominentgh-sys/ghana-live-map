
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const GHANA_BOUNDS = {
  south: 4.5,
  north: 11.2,
  west: -3.5,
  east: 1.5
};

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Ghana Live Map API"
  });
});

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (query.length < 2 || query.length > 150) {
    return res.status(400).json({
      error: "Enter a place name with 2 to 150 characters."
    });
  }

  try {
    const url = new URL(
      "https://nominatim.openstreetmap.org/search"
    );

    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "gh");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set(
      "viewbox",
      `${GHANA_BOUNDS.west},${GHANA_BOUNDS.north},${GHANA_BOUNDS.east},${GHANA_BOUNDS.south}`
    );

    const response = await fetch(url, {
      headers: {
        "User-Agent": "GhanaLiveMap/1.0 (development)"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error("Place search service is unavailable.");
    }

    const data = await response.json();

    const places = data
      .filter((place) => {
        const lat = Number(place.lat);
        const lon = Number(place.lon);

        return (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= GHANA_BOUNDS.south &&
          lat <= GHANA_BOUNDS.north &&
          lon >= GHANA_BOUNDS.west &&
          lon <= GHANA_BOUNDS.east
        );
      })
      .map((place) => ({
        id: String(place.place_id),
        name: place.display_name,
        lat: Number(place.lat),
        lon: Number(place.lon),
        type: place.type || "place"
      }));

    res.json({ places });
  } catch (error) {
    console.error("Search error:", error.message);
    res.status(502).json({
      error: "Unable to search places right now. Please try again."
    });
  }
});

app.get("/api/route", async (req, res) => {
  const startLat = Number(req.query.startLat);
  const startLon = Number(req.query.startLon);
  const endLat = Number(req.query.endLat);
  const endLon = Number(req.query.endLon);

  const coordinates = [
    [startLat, startLon],
    [endLat, endLon]
  ];

  const valid = coordinates.every(
    ([lat, lon]) =>
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= GHANA_BOUNDS.south &&
      lat <= GHANA_BOUNDS.north &&
      lon >= GHANA_BOUNDS.west &&
      lon <= GHANA_BOUNDS.east
  );

  if (!valid) {
    return res.status(400).json({
      error: "Both route locations must be within Ghana."
    });
  }

  try {
    const coordinateString =
      `${startLon},${startLat};${endLon},${endLat}`;

    const url =
      `https://router.project-osrm.org/route/v1/driving/${coordinateString}` +
      "?overview=full&geometries=geojson&steps=true";

    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error("Routing service is unavailable.");
    }

    const data = await response.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      return res.status(404).json({
        error: "No driving route was found between these locations."
      });
    }

    const route = data.routes[0];

    res.json({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
      steps: (route.legs || []).flatMap((leg) =>
        (leg.steps || []).map((step) => ({
          instruction:
            step.maneuver?.type === "arrive"
              ? "Arrive at your destination"
              : step.name
                ? `${step.maneuver?.type || "Continue"} on ${step.name}`
                : "Continue along the route",
          distanceMeters: step.distance
        }))
      )
    });
  } catch (error) {
    console.error("Route error:", error.message);
    res.status(502).json({
      error: "Unable to calculate a route right now. Please try again."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ghana Live Map API running on port ${PORT}`);
});
