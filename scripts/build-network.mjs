// Snapshots the MBTA rapid-transit network (stations, lines, stop order) from the
// official V3 API into src/data/network.json. Static data: rerun only when the map changes.
//   node scripts/build-network.mjs
import { writeFileSync } from "node:fs";

const API = "https://api-v3.mbta.com";
const headers = process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : {};
const get = async (path) => {
  let res = await fetch(API + path, { headers });
  while (res.status === 429) {
    // Keyless access is limited to 20 requests/minute; wait for the window to reset.
    const wait = Math.max(1, Number(res.headers.get("x-ratelimit-reset")) - Date.now() / 1000) + 1;
    console.log(`rate limited, waiting ${Math.round(wait)}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await fetch(API + path, { headers });
  }
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
};

const routesRes = await get("/routes?filter[type]=0,1");
const routes = routesRes.data.map((r) => ({
  id: r.id,
  name: r.attributes.long_name,
  color: "#" + r.attributes.color,
  textColor: "#" + r.attributes.text_color,
  // Green-B/C/D/E share one "line" for collection + transfer purposes.
  line: r.id.startsWith("Green") ? "Green" : r.id,
}));

const stations = {};
const patterns = [];
for (const route of routes) {
  const stopsRes = await get(`/stops?filter[route]=${route.id}`);
  for (const s of stopsRes.data) {
    const st = (stations[s.id] ??= {
      id: s.id,
      name: s.attributes.name,
      lat: s.attributes.latitude,
      lng: s.attributes.longitude,
      municipality: s.attributes.municipality,
      accessible: s.attributes.wheelchair_boarding === 1,
      routes: [],
    });
    st.routes.push(route.id);
  }
  const pat = await get(
    `/route_patterns?filter[route]=${route.id}&filter[canonical]=true&filter[direction_id]=0&include=representative_trip.stops`,
  );
  const inc = pat.included ?? [];
  const stopParent = Object.fromEntries(
    inc.filter((i) => i.type === "stop").map((s) => [s.id, s.relationships.parent_station.data?.id ?? s.id]),
  );
  const trips = Object.fromEntries(inc.filter((i) => i.type === "trip").map((t) => [t.id, t]));
  for (const p of pat.data.filter((p) => p.attributes.typicality === 1)) {
    const trip = trips[p.relationships.representative_trip.data.id];
    patterns.push({
      route: route.id,
      name: p.attributes.name,
      stops: trip.relationships.stops.data.map((s) => stopParent[s.id]),
    });
  }
}

const out = { generatedAt: new Date().toISOString(), source: API, routes, stations: Object.values(stations), patterns };
writeFileSync(new URL("../src/data/network.json", import.meta.url), JSON.stringify(out));
console.log(`${routes.length} routes, ${out.stations.length} stations, ${patterns.length} patterns`);
for (const p of patterns) console.log(` ${p.route}: ${p.name} (${p.stops.length} stops)`);
