import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://tdgwulykndzopmkmzsfg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3d1bHlrbmR6b3Bta216c2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjczOTUsImV4cCI6MjA5NTU0MzM5NX0.kp19XJcMD9tgP1-NtqK5go24h50gOfn5HUtcCtumHm0"
);

const STORAGE_KEY = "fernweh_all";

async function loadFromDB() {
  const { data, error } = await supabase
    .from("app_data")
    .select("data")
    .eq("id", STORAGE_KEY)
    .single();
  if (error || !data) return null;
  return data.data;
}

async function saveToDB(payload) {
  await supabase
    .from("app_data")
    .upsert({ id: STORAGE_KEY, data: payload, updated_at: new Date().toISOString() });
}

function generateDayColor(index) {
  const hue = (index * 137.5) % 360; // golden angle — guarantees distinct, non-repeating hues
  return {
    accent: `hsl(${hue}, 70%, 72%)`,
    bg: `hsla(${hue}, 40%, 55%, 0.22)`,
    border: `hsla(${hue}, 40%, 55%, 0.18)`,
    stopBg: '#2020208c',
    stopBorder: `hsla(${hue}, 40%, 45%, 0.30)`,
  };
}

const STOP_TYPES = ["activity", "flight", "hotel", "food"];

const TYPE_ICON = {
  activity: null,
  flight: "✈️",
  hotel: "🏨",
  food: "🍜",
};

function makeIcon(label, color, type) {
  const icon =
    type === "flight" ? "✈️"
    : type === "hotel" ? "🏨"
    : type === "food" ? "🍜"
    : label;
  return L.divIcon({
    html: `
      <div style="
        background:${color};
        color:#0f0f13;
        width:40px;
        height:40px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:15px;
        font-weight:700;
        border:2px solid rgba(0,0,0,0.25)
      ">
        <span style="transform:rotate(45deg)">${icon}</span>
      </div>
    `,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -42],
  });
}

function makeStarIcon() {
  return L.divIcon({
    html: `
      <div style="
        background:#FFD700;
        color:#0f0f13;
        width:40px;
        height:40px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:15px;
        border:2px solid rgba(0,0,0,0.25)
      ">
        <span style="transform:rotate(45deg)">★</span>
      </div>
    `,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });
}

function emptyTrip(name) {
  return {
    id: Date.now(),
    tripName: name || "New Trip",
    days: [
      { id: 1, label: "Day 1", date: "2025-09-01", stops: [] },
      { id: 2, label: "Day 2", date: "2025-09-02", stops: [] },
    ],
    pins: [],
    wishlist: [],
    nextDayId: 3,
    nextPinId: 1,
  };
}

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// Sort days by date, then relabel Day 1, Day 2 etc in order
function sortAndRelabelDays(days) {
  const sorted = [...days].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  return sorted.map((d, i) => ({ ...d, label: `Day ${i + 1}` }));
}

function reindexPins(days, pins) {
  if (!days || !pins) return [];
  let counter = 1;
  const labelMap = {};
  days.forEach((day) => {
    if (!day?.stops) return;
    const dayPins = day.stops
      .map((sid) => pins.find((p) => p.id === sid))
      .filter(Boolean)
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
    dayPins.forEach((p) => {
      if (!p.type || p.type === "activity") {
        labelMap[p.id] = String(counter++);
      } else {
        labelMap[p.id] = TYPE_ICON[p.type] || "?";
      }
    });
  });
  return pins.map((pin) => ({ ...pin, label: labelMap[pin.id] ?? "?" }));
}

// ── Root ───────────────────────────────────────────────────────

export default function Root() {
  const [allData, setAllData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showTripMenu, setShowTripMenu] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const saveTimerRef = useRef(null);

  useEffect(() => {
    loadFromDB().then((saved) => {
      if (saved && saved.trips && saved.trips.length > 0) {
        setAllData(saved);
      } else {
        const first = emptyTrip("Japan 2025");
        setAllData({ activeId: first.id, trips: [first] });
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded || !allData) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToDB(allData), 800);
    return () => clearTimeout(saveTimerRef.current);
  }, [allData, loaded]);

  if (!loaded) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0f0f13", color: "#888794",
        fontSize: "14px", gap: "10px",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8f55a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Loading your trips...
      </div>
    );
  }

  const activeTrip = allData.trips.find((t) => t.id === allData.activeId) || allData.trips[0];

  function updateTrip(updatedTrip) {
    setAllData((prev) => ({
      ...prev,
      trips: prev.trips.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)),
    }));
  }

  function createTrip() {
    const name = newTripName.trim() || "New Trip";
    const trip = emptyTrip(name);
    setAllData((prev) => ({ activeId: trip.id, trips: [...prev.trips, trip] }));
    setNewTripName("");
    setShowTripMenu(false);
  }

  function deleteTrip(id) {
    if (allData.trips.length === 1) return;
    if (!window.confirm("Delete this trip? This cannot be undone.")) return;
    setAllData((prev) => {
      const trips = prev.trips.filter((t) => t.id !== id);
      const activeId = prev.activeId === id ? trips[0].id : prev.activeId;
      return { activeId, trips };
    });
  }

  return (
    <>
      {showTripMenu && (
        <div className="trip-menu-overlay" onClick={() => setShowTripMenu(false)}>
          <div className="trip-menu" onClick={(e) => e.stopPropagation()}>
            <div className="trip-menu-header">
              <span>My Trips</span>
              <button className="trip-menu-close" onClick={() => setShowTripMenu(false)}>✕</button>
            </div>
            <div className="trip-list">
              {allData.trips.map((trip) => (
                <div
                  key={trip.id}
                  className={`trip-list-item${trip.id === allData.activeId ? " active-trip" : ""}`}
                >
                  <span
                    className="trip-list-name"
                    onClick={() => {
                      setAllData((prev) => ({ ...prev, activeId: trip.id }));
                      setShowTripMenu(false);
                    }}
                  >
                    {trip.tripName}
                  </span>
                  <div className="trip-list-actions">
                    {allData.trips.length > 1 && (
                      <button className="trip-action-btn danger" onClick={() => deleteTrip(trip.id)} title="Delete">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="trip-new-row">
              <input
                className="trip-new-input"
                placeholder="New trip name..."
                value={newTripName}
                onChange={(e) => setNewTripName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTrip()}
              />
              <button className="trip-new-btn" onClick={createTrip}>+ Create</button>
            </div>
          </div>
        </div>
      )}
      <App
        key={activeTrip.id}
        trip={activeTrip}
        onUpdate={updateTrip}
        onOpenTripMenu={() => setShowTripMenu(true)}
      />
    </>
  );
}

// ── App ────────────────────────────────────────────────────────

function App({ trip, onUpdate, onOpenTripMenu }) {
  const [tripName, setTripName] = useState(trip.tripName);
  const [editingTitle, setEditingTitle] = useState(false);
  const [days, setDays] = useState(() => sortAndRelabelDays(trip.days));
  const [pins, setPins] = useState(trip.pins);
  const [nextDayId, setNextDayId] = useState(trip.nextDayId);
  const [nextPinId, setNextPinId] = useState(trip.nextPinId);
  const [wishlist, setWishlist] = useState(trip.wishlist || []);
  const [tab, setTab] = useState("itinerary");
  const [highlighted, setHighlighted] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingAsWish, setPendingAsWish] = useState(false);
  const [popupName, setPopupName] = useState("");
  const [popupDay, setPopupDay] = useState(null);
  const [popupTime, setPopupTime] = useState("09:00");
  const [popupType, setPopupType] = useState("");
  const [showRoute, setShowRoute] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});
  const wishMarkersRef = useRef({});
  const routeLinesRef = useRef([]);
  const daysRef = useRef(days);
  const pinsRef = useRef(pins);
  const wishlistRef = useRef(wishlist);
  const titleInputRef = useRef(null);

  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  useEffect(() => { wishlistRef.current = wishlist; }, [wishlist]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    onUpdate({ ...trip, tripName, days, pins, wishlist, nextDayId, nextPinId });
  }, [tripName, days, pins, wishlist, nextDayId, nextPinId]);

  useEffect(() => {
    if (!days?.length || !pins?.length) return;
    const indexed = reindexPins(days, pins);
    indexed.forEach((pin) => {
      if (markersRef.current[pin.id] && pin.lat !== null) {
        const dayIdx = days.findIndex((d) => d.id === pin.dayId);
        const color = generateDayColor(dayIdx).accent;
        markersRef.current[pin.id].setIcon(makeIcon(pin.label, color, pin.type));
      }
    });
  }, [pins, days]);

  useEffect(() => {
    if (!leafletMap.current) return;
    routeLinesRef.current.forEach((l) => l.remove());
    routeLinesRef.current = [];
    if (!showRoute) return;
    days.forEach((day, dayIdx) => {
      const dayPins = (day.stops || [])
        .map((sid) => pins.find((p) => p.id === sid))
        .filter((p) => p && p.lat !== null)
        .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
      if (dayPins.length < 2) return;
      const color = generateDayColor(dayIdx).accent;
      const line = L.polyline(
        dayPins.map((p) => [p.lat, p.lng]),
        { color, weight: 2.5, opacity: 0.7, dashArray: "6 4" }
      ).addTo(leafletMap.current);
      routeLinesRef.current.push(line);
    });
  }, [showRoute, pins, days]);

  useEffect(() => {
    if (leafletMap.current) return;
    const geoPins = pinsRef.current.filter((p) => p.lat !== null && p.lng !== null);
    const map = L.map(mapRef.current, { zoomControl: false });
    if (geoPins.length > 0) {
      map.fitBounds(L.latLngBounds(geoPins.map((p) => [p.lat, p.lng])), { padding: [60, 60] });
    } else {
      map.setView([35.68, 139.69], 5);
    }
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", maxZoom: 19 }
    ).addTo(map);

    map.on("click", async (e) => {
      const lat = +e.latlng.lat.toFixed(4);
      const lng = +e.latlng.lng.toFixed(4);
      setPending({ lat, lng });
      setPendingAsWish(false);
      setPopupTime("09:00");
      setPopupType("");
      setPopupDay(daysRef.current[0]?.id ?? null);
      setPopupName("Loading...");
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        setPopupName(data.name || data.address?.tourism || data.address?.amenity || data.address?.road || data.address?.suburb || data.address?.city || "");
      } catch { setPopupName(""); }
    });

    map.on("contextmenu", async (e) => {
      L.DomEvent.preventDefault(e);
      const lat = +e.latlng.lat.toFixed(4);
      const lng = +e.latlng.lng.toFixed(4);
      setPending({ lat, lng });
      setPendingAsWish(true);
      setPopupName("Loading...");
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        setPopupName(data.name || data.address?.tourism || data.address?.amenity || data.address?.road || data.address?.suburb || data.address?.city || `${lat}, ${lng}`);
      } catch { setPopupName(`${lat}, ${lng}`); }
    });

    leafletMap.current = map;
    const indexed = reindexPins(daysRef.current, pinsRef.current);
    indexed.forEach((pin) => { if (pin.lat !== null) addMarkerToMap(pin, daysRef.current, map); });
    wishlistRef.current.forEach((w) => placeWishMarker(w, map));

    return () => {
      map.remove();
      leafletMap.current = null;
      markersRef.current = {};
      wishMarkersRef.current = {};
      routeLinesRef.current = [];
    };
  }, []);

  function addMarkerToMap(pin, currentDays, map) {
    const m = map || leafletMap.current;
    const dayIdx = currentDays.findIndex((d) => d.id === pin.dayId);
    const color = generateDayColor(dayIdx).accent;
    const marker = L.marker([pin.lat, pin.lng], { icon: makeIcon(pin.label, color, pin.type) });
    marker.on("click", () => {
      setHighlighted(pin.id);
      leafletMap.current.setView([pin.lat, pin.lng], 12, { animate: true });
    });
    marker.addTo(m);
    markersRef.current[pin.id] = marker;
  }

  function placeWishMarker(w, map) {
    const m = map || leafletMap.current;
    const marker = L.marker([w.lat, w.lng], { icon: makeStarIcon() });
    const id = w.id;
    function buildPopupContent(name) {
      return `
        <div style="font-family:sans-serif;font-size:13px;min-width:180px">
          <div style="font-weight:600;margin-bottom:6px">⭐ Wishlist</div>
          <input id="wish-input-${id}" value="${name.replace(/"/g, "&quot;")}"
            style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;margin-bottom:8px;font-size:12px;" />
          <div style="display:flex;gap:6px">
            <button id="save-wish-${id}" style="flex:1;font-size:12px;cursor:pointer;background:#eef8ee;border:1px solid #b7ddb7;border-radius:6px;padding:5px 8px;color:#2a7a2a">Save</button>
            <button id="remove-wish-${id}" style="flex:1;font-size:12px;cursor:pointer;background:#fee;border:1px solid #fcc;border-radius:6px;padding:5px 8px;color:#c33">Remove</button>
          </div>
        </div>`;
    }
    marker.bindPopup(buildPopupContent(w.name));
    marker.on("popupopen", () => {
      document.getElementById(`save-wish-${id}`)?.addEventListener("click", () => {
        const newName = document.getElementById(`wish-input-${id}`)?.value?.trim();
        if (!newName) return;
        setWishlist((prev) => prev.map((x) => (x.id === id ? { ...x, name: newName } : x)));
        marker.closePopup();
        marker.bindPopup(buildPopupContent(newName));
      });
      document.getElementById(`remove-wish-${id}`)?.addEventListener("click", () => {
        marker.remove();
        delete wishMarkersRef.current[id];
        setWishlist((prev) => prev.filter((x) => x.id !== id));
      });
    });
    marker.addTo(m);
    wishMarkersRef.current[id] = marker;
    return marker;
  }

  function confirmPin() {
    if (!pending) return;
    const name = popupName.trim() || "Unnamed Stop";
    if (pendingAsWish) {
      const w = { id: Date.now(), name, lat: pending.lat, lng: pending.lng };
      placeWishMarker(w);
      setWishlist((prev) => [...prev, w]);
      setPending(null);
      return;
    }
    const dayId = popupDay ?? days[0]?.id;
    const pin = {
      id: nextPinId, label: "?", name, time: popupTime,
      type: popupType || "activity", notes: "", cost: "",
      lat: pending.lat, lng: pending.lng, dayId,
    };
    const newDays = daysRef.current.map((d) =>
      d.id === dayId ? { ...d, stops: [...d.stops, pin.id] } : d
    );
    const newPins = reindexPins(newDays, [...pinsRef.current, pin]);
    setPins(newPins);
    setDays(newDays);
    setNextPinId((n) => n + 1);
    addMarkerToMap(newPins.find((p) => p.id === pin.id), newDays);
    setPending(null);
  }

  function confirmAsWish() {
    if (!pending) return;
    const name = popupName.trim() || "Unnamed Place";
    const w = { id: Date.now(), name, lat: pending.lat, lng: pending.lng };
    placeWishMarker(w);
    setWishlist((prev) => [...prev, w]);
    setPending(null);
  }

  function removePin(pinId) {
    if (markersRef.current[pinId]) { markersRef.current[pinId].remove(); delete markersRef.current[pinId]; }
    const newDays = days.map((d) => ({ ...d, stops: d.stops.filter((s) => s !== pinId) }));
    const newPins = reindexPins(newDays, pins.filter((p) => p.id !== pinId));
    setDays(newDays);
    setPins(newPins);
  }

  function clearAll() {
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    setPins([]);
    setDays((ds) => ds.map((d) => ({ ...d, stops: [] })));
  }

  function addDay() {
    const lastDay = days[days.length - 1];
    const newDate = lastDay ? addDaysToDate(lastDay.date, 1) : new Date().toISOString().split("T")[0];
    const newDay = { id: nextDayId, label: "", date: newDate, stops: [] };
    const sorted = sortAndRelabelDays([...days, newDay]);
    setDays(sorted);
    setNextDayId((x) => x + 1);
  }

  function removeDay(dayId) {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    const stopCount = day.stops.length;
    const msg = stopCount > 0
      ? `Delete ${day.label}? This will also remove its ${stopCount} stop${stopCount !== 1 ? "s" : ""}.`
      : `Delete ${day.label}?`;
    if (!window.confirm(msg)) return;
    day.stops.forEach((sid) => {
      if (markersRef.current[sid]) { markersRef.current[sid].remove(); delete markersRef.current[sid]; }
    });
    const remainingPins = pins.filter((p) => !day.stops.includes(p.id));
    const remainingDays = sortAndRelabelDays(days.filter((d) => d.id !== dayId));
    setPins(reindexPins(remainingDays, remainingPins));
    setDays(remainingDays);
  }

  function handleDateChange(dayId, newDate) {
    const updated = days.map((d) => (d.id === dayId ? { ...d, date: newDate } : d));
    const sorted = sortAndRelabelDays(updated);
    setDays(sorted);
  }

  function addManualStop(dayId, name, time, type) {
    if (!name.trim()) return;
    const pin = {
      id: nextPinId, label: "?", name: name.trim(),
      time: time || "09:00", type: type || "activity",
      notes: "", cost: "", lat: null, lng: null, dayId,
    };
    const newDays = days.map((d) => d.id === dayId ? { ...d, stops: [...d.stops, pin.id] } : d);
    const newPins = reindexPins(newDays, [...pins, pin]);
    setPins(newPins);
    setDays(newDays);
    setNextPinId((n) => n + 1);
  }

  function updateStopTime(pinId, time) {
    setPins(reindexPins(days, pins.map((p) => (p.id === pinId ? { ...p, time } : p))));
  }

  function updateStopName(pinId, name) {
    setPins((ps) => ps.map((p) => (p.id === pinId ? { ...p, name } : p)));
  }

  function updateStopNotes(pinId, notes) {
    setPins((ps) => ps.map((p) => (p.id === pinId ? { ...p, notes } : p)));
  }

  function updateStopCost(pinId, cost) {
    setPins((ps) => ps.map((p) => (p.id === pinId ? { ...p, cost } : p)));
  }

  function updateStopType(pinId, type) {
    const reindexed = reindexPins(days, pins.map((p) => (p.id === pinId ? { ...p, type } : p)));
    setPins(reindexed);
    const pin = reindexed.find((p) => p.id === pinId);
    if (pin && pin.lat !== null && markersRef.current[pinId]) {
      const dayIdx = days.findIndex((d) => d.id === pin.dayId);
      const color = generateDayColor(dayIdx).accent;
      markersRef.current[pinId].setIcon(makeIcon(pin.label, color, pin.type));
    }
  }

  function focusPin(pinId) {
    setHighlighted(pinId);
    const pin = pins.find((p) => p.id === pinId);
    if (pin?.lat !== null && pin?.lat !== undefined) {
      leafletMap.current?.setView([pin.lat, pin.lng], 12, { animate: true });
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { setSearchError("No results found."); }
      else { setSearchResults(data); }
    } catch { setSearchError("Search failed."); }
    finally { setSearchLoading(false); }
  }

  function selectSearchResult(result) {
    const lat = +parseFloat(result.lat).toFixed(4);
    const lng = +parseFloat(result.lon).toFixed(4);
    leafletMap.current?.setView([lat, lng], 13, { animate: true });
    const shortName = result.name || result.display_name.split(",")[0];
    setPending({ lat, lng });
    setPendingAsWish(false);
    setPopupName(shortName);
    setPopupTime("09:00");
    setPopupType("");
    setPopupDay(daysRef.current[0]?.id ?? null);
    setSearchResults([]);
    setSearchQuery("");
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="title-edit-input"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              />
            ) : (
              <div className="title-row">
                <div className="app-title">{tripName}</div>
                <button className="title-edit-btn" onClick={() => setEditingTitle(true)} title="Edit trip name">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </button>
              </div>
            )}
            <button className="trips-menu-btn" onClick={onOpenTripMenu} title="All trips">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              Trips
            </button>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab${tab === "itinerary" ? " active" : ""}`} onClick={() => setTab("itinerary")}>Itinerary</button>
          <button className={`tab${tab === "costs" ? " active" : ""}`} onClick={() => setTab("costs")}>Costs</button>
        </div>

        <div className="sidebar-body">
          {tab === "itinerary" ? (
            <>
              {days.map((day, dayIdx) => (
                <DayBlock
                  key={day.id}
                  day={day}
                  dayIdx={dayIdx}
                  pins={pins}
                  highlighted={highlighted}
                  onFocus={focusPin}
                  onRemovePin={removePin}
                  onRemoveDay={removeDay}
                  onDateChange={(date) => handleDateChange(day.id, date)}
                  onAddStop={(name, time, type) => addManualStop(day.id, name, time, type)}
                  onTimeChange={updateStopTime}
                  onNameChange={updateStopName}
                  onNotesChange={updateStopNotes}
                  onTypeChange={updateStopType}
                />
              ))}
              <button className="add-day-btn" onClick={addDay}>+ Add Day</button>
            </>
          ) : (
            <CostsTab pins={pins} days={days} onCostChange={updateStopCost} />
          )}
        </div>
      </div>

      <div className="map-area">
        <div ref={mapRef} id="map" />
        <div className="map-search-bar">
          <div style={{ position: "relative", flex: 1 }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
              <input
                className="map-search-input"
                placeholder="Search a place..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults([]); }}
              />
              <button className="map-search-btn" type="submit">{searchLoading ? "..." : "Search"}</button>
            </form>
            {(searchResults.length > 0 || searchError) && (
              <div className="search-results-dropdown">
                {searchError && <div className="search-error">{searchError}</div>}
                {searchResults.map((r) => (
                  <div key={r.place_id} className="search-result-item" onClick={() => selectSearchResult(r)}>
                    <div className="search-result-name">{r.name || r.display_name.split(",")[0]}</div>
                    <div className="search-result-addr">{r.display_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="map-overlay">
          <div className="map-badge">
            <strong>Click to drop pin</strong>
            Right-click to wishlist ⭐
          </div>
          <button className={`clear-btn${showRoute ? " active-btn" : ""}`} onClick={() => setShowRoute((v) => !v)}>
            {showRoute ? "✕ Hide route" : "⟶ Show route"}
          </button>
          <button className="clear-btn" onClick={clearAll}>✕ Clear all pins</button>
        </div>

        {pending && (
          <div className="pin-popup">
            {pendingAsWish ? (
              <>
                <div className="pin-popup-title">⭐ Add to Wishlist</div>
                <input className="pin-popup-input" autoFocus placeholder="Place name..." value={popupName}
                  onChange={(e) => setPopupName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmPin()} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="pin-popup-btn secondary" onClick={() => setPending(null)}>Cancel</button>
                  <button className="pin-popup-btn" onClick={confirmPin}>Save to Wishlist</button>
                </div>
              </>
            ) : (
              <>
                <div className="pin-popup-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>📍 New Stop</span>
                  <button className="wish-instead-btn" onClick={confirmAsWish}>★ Wishlist instead</button>
                </div>
                <input className="pin-popup-input" autoFocus placeholder="Place name..." value={popupName}
                  onChange={(e) => setPopupName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmPin()} />
                <div className="pin-popup-row">
                  <label className="pin-popup-label">Time</label>
                  <input className="pin-popup-input" type="time" value={popupTime} onChange={(e) => setPopupTime(e.target.value)} />
                </div>
                <div className="pin-popup-row">
                  <label className="pin-popup-label">Type</label>
                  <select className="pin-popup-select" value={popupType} onChange={(e) => setPopupType(e.target.value)}>
                    <option value="">Add Label</option>
                    {STOP_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <select className="pin-popup-select" value={popupDay ?? ""} onChange={(e) => setPopupDay(+e.target.value)}>
                  {days.map((d) => <option key={d.id} value={d.id}>{d.label} — {d.date}</option>)}
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="pin-popup-btn secondary" onClick={() => setPending(null)}>Cancel</button>
                  <button className="pin-popup-btn" onClick={confirmPin}>Add to Itinerary</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DayBlock ───────────────────────────────────────────────────

function DayBlock({ day, dayIdx, pins, highlighted, onFocus, onRemovePin, onRemoveDay, onDateChange, onAddStop, onTimeChange, onNameChange, onNotesChange, onTypeChange }) {
  const [input, setInput] = useState("");
  const [time, setTime] = useState("09:00");
  const [type, setType] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const { accent: accentColor, bg: bgColor, border: borderColor, stopBg, stopBorder } = generateDayColor(dayIdx);

  const stops = (day.stops || [])
    .map((sid) => pins.find((p) => p.id === sid))
    .filter(Boolean)
    .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));

  return (
    <div className="day-block" style={{ background: bgColor, borderColor: borderColor }}>
      <div className="day-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="day-label" style={{ color: accentColor }}>{day.label}</div>
          <input className="day-date-input" type="date" value={day.date} onChange={(e) => onDateChange(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button
            className="btn-icon"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand" : "Collapse"}
            style={{ fontSize: 14 }}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          <button className="btn-icon" onClick={() => onRemoveDay(day.id)}>✕</button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="stops-list">
            {stops.length === 0 && <div className="empty">No stops yet — click the map or type below</div>}
            {stops.map((s) => (
              <div
                key={s.id}
                className={`stop-item${highlighted === s.id ? " highlighted" : ""}`}
                style={{ background: stopBg, borderColor: stopBorder }}
                onClick={() => onFocus(s.id)}
              >
                <div className="stop-num" style={{ background: accentColor }}>
                  {s.type === "flight" ? "✈️" : s.type === "hotel" ? "🏨" : s.type === "food" ? "🍜" : s.label}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === s.id ? (
                    <input
                      className="stop-name-input"
                      autoFocus
                      value={s.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onNameChange(s.id, e.target.value); }}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                    />
                  ) : (
                    <div className="stop-name" onClick={(e) => { e.stopPropagation(); setEditingId(s.id); }} title="Click to edit name">
                      {s.name}
                      <span className="stop-name-edit-hint">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                        </svg>
                      </span>
                    </div>
                  )}
                  <div className="stop-meta">
                    <input className="time-input" type="time" value={s.time || "09:00"}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onTimeChange(s.id, e.target.value); }} />
                    <select className="type-select" value={s.type || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onTypeChange(s.id, e.target.value); }}>
                      <option value="">Add Label</option>
                      {STOP_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <textarea
                    className="stop-notes"
                    placeholder="Add notes..."
                    value={s.notes || ""}
                    rows={s.notes ? s.notes.split("\n").length + 1 : 1}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); onNotesChange(s.id, e.target.value); }}
                  />
                </div>
                <button className="stop-remove" onClick={(e) => { e.stopPropagation(); onRemovePin(s.id); }}>✕</button>
              </div>
            ))}
          </div>

          <div className="add-stop-row">
            <input
              className="add-stop-input"
              placeholder="Stop name..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { onAddStop(input, time, type); setInput(""); } }}
            />
            <input className="add-time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <select className="add-type-select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Label</option>
              {STOP_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <button className="btn-add" onClick={() => { onAddStop(input, time, type); setInput(""); }}>+</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── CostsTab ───────────────────────────────────────────────────

function CostsTab({ pins, days, onCostChange }) {
  const groups = { flight: [], hotel: [], activity: [], food: [] };
  days.forEach((day) => {
    (day.stops || []).forEach((sid) => {
      const pin = pins.find((p) => p.id === sid);
      if (!pin) return;
      const t = pin.type || "activity";
      if (groups[t]) groups[t].push({ ...pin, dayLabel: day.label });
    });
  });
  const typeLabels = { flight: "✈️ Flights", hotel: "🏨 Hotels", activity: "🎯 Activities", food: "🍜 Food & Dining" };
  function subtotal(arr) { return arr.reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0); }
  const grandTotal = Object.values(groups).reduce((s, arr) => s + subtotal(arr), 0);
  return (
    <div className="costs-tab">
      {Object.entries(groups).map(([type, items]) => (
        <div key={type} className="cost-group">
          <div className="cost-group-header">
            <span>{typeLabels[type]}</span>
            <span className="cost-subtotal">${subtotal(items).toFixed(2)}</span>
          </div>
          {items.length === 0 ? (
            <div className="cost-empty">No {type}s added yet</div>
          ) : (
            <table className="cost-table">
              <tbody>
                {items.map((pin) => (
                  <tr key={pin.id} className="cost-row">
                    <td className="cost-name">
                      <div>{pin.name}</div>
                      <div className="cost-day-label">{pin.dayLabel}</div>
                    </td>
                    <td className="cost-input-cell">
                      <div className="cost-input-wrap">
                        <span className="cost-dollar">$</span>
                        <input className="cost-input" type="number" min="0" step="0.01" placeholder="0.00"
                          value={pin.cost || ""} onChange={(e) => onCostChange(pin.id, e.target.value)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <div className="cost-total-row">
        <span>Total</span>
        <span>${grandTotal.toFixed(2)}</span>
      </div>
    </div>
  );
}