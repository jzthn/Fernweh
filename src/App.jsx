import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const DAY_COLORS = [
  "#c8f55a", "#7eb3ff", "#ff9f7e",
  "#e878b8", "#78e8c8", "#ffcc55",
  "#ff8888", "#aaaaff"
];

const STOP_TYPES = ["activity", "flight", "hotel", "food"];

const TYPE_ICON = {
  activity: null,
  flight: "✈️",
  hotel: "🏨",
  food: "🍜",
};

function makeIcon(label, color, type) {
  const icon =
    type === "flight"
      ? "✈️"
      : type === "hotel"
      ? "🏨"
      : type === "food"
      ? "🍜"
      : label;

  return L.divIcon({
    html: `
      <div style="
        background:${color};
        color:#0f0f13;
        width:28px;
        height:28px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:700;
        border:2px solid rgba(0,0,0,0.25)
      ">
        <span style="transform:rotate(45deg)">
          ${icon}
        </span>
      </div>
    `,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -32],
  });
}

function makeStarIcon() {
  return L.divIcon({
    html: `
      <div style="
        background:#FFD700;
        color:#0f0f13;
        width:28px;
        height:28px;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:13px;
        border:2px solid rgba(0,0,0,0.25)
      ">
        <span style="transform:rotate(45deg)">★</span>
      </div>
    `,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function load() {
  try {
    const raw = localStorage.getItem("tripplanner");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(data) {
  localStorage.setItem("tripplanner", JSON.stringify(data));
}

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
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
  return pins.map((pin) => ({
    ...pin,
    label: labelMap[pin.id] ?? "?",
  }));
}

export default function App() {
  const saved = load();

  const [tripName, setTripName] = useState(saved?.tripName || "Japan 2025");
  const [editingTitle, setEditingTitle] = useState(false);
  const [days, setDays] = useState(
    saved?.days || [
      { id: 1, label: "Day 1", date: "2025-09-01", stops: [] },
      { id: 2, label: "Day 2", date: "2025-09-02", stops: [] },
    ]
  );
  const [pins, setPins] = useState(saved?.pins || []);
  const [nextDayId, setNextDayId] = useState(saved?.nextDayId || 3);
  const [nextPinId, setNextPinId] = useState(saved?.nextPinId || 1);
  const [tab, setTab] = useState("itinerary");
  const [highlighted, setHighlighted] = useState(null);
  const [pending, setPending] = useState(null);
  const [popupName, setPopupName] = useState("");
  const [popupDay, setPopupDay] = useState(null);
  const [popupTime, setPopupTime] = useState("09:00");
  const [popupType, setPopupType] = useState("");
  const [wishlist, setWishlist] = useState(saved?.wishlist || []);
  const [showRoute, setShowRoute] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});
  const routeLinesRef = useRef([]);
  const daysRef = useRef(days);
  const pinsRef = useRef(pins);
  const titleInputRef = useRef(null);

  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    save({ tripName, days, pins, nextDayId, nextPinId, wishlist });
  }, [tripName, days, pins, nextDayId, nextPinId, wishlist]);

  useEffect(() => {
    if (!days?.length || !pins?.length) return;
    const indexed = reindexPins(days, pins);
    indexed.forEach((pin) => {
      if (markersRef.current[pin.id] && pin.lat !== null) {
        const dayIdx = days.findIndex((d) => d.id === pin.dayId);
        const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
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
      const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
      const line = L.polyline(
        dayPins.map((p) => [p.lat, p.lng]),
        { color, weight: 2.5, opacity: 0.7, dashArray: "6 4" }
      ).addTo(leafletMap.current);
      routeLinesRef.current.push(line);
    });
  }, [showRoute, pins, days]);

  useEffect(() => {
    if (leafletMap.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView([35.68, 139.69], 5);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", maxZoom: 19 }
    ).addTo(map);

    map.on("click", async (e) => {
      const lat = +e.latlng.lat.toFixed(4);
      const lng = +e.latlng.lng.toFixed(4);
      setPending({ lat, lng });
      setPopupTime("09:00");
      setPopupType("");
      setPopupDay(daysRef.current[0]?.id ?? null);
      setPopupName("Loading...");
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );
        const data = await res.json();
        const name =
          data.name ||
          data.address?.tourism ||
          data.address?.amenity ||
          data.address?.road ||
          data.address?.suburb ||
          data.address?.city ||
          "";
        setPopupName(name);
      } catch {
        setPopupName("");
      }
    });

    map.on("contextmenu", async (e) => {
      L.DomEvent.preventDefault(e);
      const lat = +e.latlng.lat.toFixed(4);
      const lng = +e.latlng.lng.toFixed(4);
      const id = Date.now();
      const wishPin = { id, name: `${lat}, ${lng}`, lat, lng };
      const marker = L.marker([lat, lng], { icon: makeStarIcon() });
      marker.addTo(map);
      setWishlist((w) => [...w, wishPin]);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );
        const data = await res.json();
        const name =
          data.name ||
          data.address?.tourism ||
          data.address?.amenity ||
          data.address?.road ||
          data.address?.suburb ||
          data.address?.city ||
          `${lat}, ${lng}`;
        wishPin.name = name;
        setWishlist((w) => w.map((x) => (x.id === id ? { ...x, name } : x)));
      } catch { /* keep coordinate fallback */ }
      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:13px">
          <div style="font-weight:600;margin-bottom:4px">⭐ ${wishPin.name}</div>
          <button id="remove-wish-${id}" style="font-size:12px;cursor:pointer;background:#fee;border:1px solid #fcc;border-radius:6px;padding:4px 10px;color:#c33">
            Remove
          </button>
        </div>
      `);
      marker.on("popupopen", () => {
        document.getElementById(`remove-wish-${id}`)?.addEventListener("click", () => {
          marker.remove();
          setWishlist((w) => w.filter((x) => x.id !== id));
        });
      });
    });

    leafletMap.current = map;

    const indexed = reindexPins(daysRef.current, pinsRef.current);
    indexed.forEach((pin) => {
      if (pin.lat !== null) addMarkerToMap(pin, daysRef.current, map);
    });

    return () => {
      map.remove();
      leafletMap.current = null;
      markersRef.current = {};
      routeLinesRef.current = [];
    };
  }, []);

  function addMarkerToMap(pin, currentDays, map) {
    const m = map || leafletMap.current;
    const dayIdx = currentDays.findIndex((d) => d.id === pin.dayId);
    const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
    const marker = L.marker([pin.lat, pin.lng], {
      icon: makeIcon(pin.label, color, pin.type),
    });
    marker.on("click", () => {
      setHighlighted(pin.id);
      leafletMap.current.setView([pin.lat, pin.lng], 12, { animate: true });
    });
    marker.addTo(m);
    markersRef.current[pin.id] = marker;
  }

  function confirmPin() {
    if (!pending) return;
    const name = popupName.trim() || "Unnamed Stop";
    const dayId = popupDay ?? days[0]?.id;
    const pin = {
      id: nextPinId,
      label: "?",
      name,
      time: popupTime,
      type: popupType || "activity",
      notes: "",
      cost: "",
      lat: pending.lat,
      lng: pending.lng,
      dayId,
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

  function removePin(pinId) {
    if (markersRef.current[pinId]) {
      markersRef.current[pinId].remove();
      delete markersRef.current[pinId];
    }
    const newDays = days.map((d) => ({
      ...d,
      stops: d.stops.filter((s) => s !== pinId),
    }));
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
    const newDate = lastDay
      ? addDaysToDate(lastDay.date, 1)
      : new Date().toISOString().split("T")[0];
    const n = days.length + 1;
    setDays([
      ...days,
      { id: nextDayId, label: `Day ${n}`, date: newDate, stops: [] },
    ]);
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
    day.stops.forEach((sid) => removePin(sid));
    setDays((ds) => ds.filter((d) => d.id !== dayId));
  }

  function addManualStop(dayId, name, time, type) {
    if (!name.trim()) return;
    const pin = {
      id: nextPinId,
      label: "?",
      name: name.trim(),
      time: time || "09:00",
      type: type || "",
      notes: "",
      cost: "",
      lat: null,
      lng: null,
      dayId,
    };
    const newDays = days.map((d) =>
      d.id === dayId ? { ...d, stops: [...d.stops, pin.id] } : d
    );
    const newPins = reindexPins(newDays, [...pins, pin]);
    setPins(newPins);
    setDays(newDays);
    setNextPinId((n) => n + 1);
  }

  function updateStopTime(pinId, time) {
    const updatedPins = pins.map((p) => (p.id === pinId ? { ...p, time } : p));
    setPins(reindexPins(days, updatedPins));
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
    const updatedPins = pins.map((p) => (p.id === pinId ? { ...p, type } : p));
    const reindexed = reindexPins(days, updatedPins);
    setPins(reindexed);
    // Update marker icon
    const pin = reindexed.find((p) => p.id === pinId);
    if (pin && pin.lat !== null && markersRef.current[pinId]) {
      const dayIdx = days.findIndex((d) => d.id === pin.dayId);
      const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
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
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setSearchError("No results found.");
      } else {
        setSearchResults(data);
      }
    } catch (err) {
      console.error(err);
      setSearchError("Search failed.");
    } finally {
      setSearchLoading(false);
    }
  }

  function selectSearchResult(result) {
    const lat = +parseFloat(result.lat).toFixed(4);
    const lng = +parseFloat(result.lon).toFixed(4);
    leafletMap.current?.setView([lat, lng], 13, { animate: true });
    const shortName = result.name || result.display_name.split(",")[0];
    setPending({ lat, lng });
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="tabs">
          <button
            className={`tab${tab === "itinerary" ? " active" : ""}`}
            onClick={() => setTab("itinerary")}
          >
            Itinerary
          </button>
          <button
            className={`tab${tab === "costs" ? " active" : ""}`}
            onClick={() => setTab("costs")}
          >
            Costs
          </button>
        </div>

        <div className="sidebar-body">
          {tab === "itinerary" ? (
            <>
              {days.map((day) => (
                <DayBlock
                  key={day.id}
                  day={day}
                  pins={pins}
                  highlighted={highlighted}
                  onFocus={focusPin}
                  onRemovePin={removePin}
                  onRemoveDay={removeDay}
                  onDateChange={(date) =>
                    setDays(days.map((d) => (d.id === day.id ? { ...d, date } : d)))
                  }
                  onAddStop={(name, time, type) => addManualStop(day.id, name, time, type)}
                  onTimeChange={updateStopTime}
                  onNameChange={updateStopName}
                  onNotesChange={updateStopNotes}
                  onTypeChange={updateStopType}
                />
              ))}
              <button className="add-day-btn" onClick={addDay}>
                + Add Day
              </button>
            </>
          ) : (
            <CostsTab
              pins={pins}
              days={days}
              onCostChange={updateStopCost}
            />
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value) setSearchResults([]);
                }}
              />
              <button className="map-search-btn" type="submit">
                {searchLoading ? "..." : "Search"}
              </button>
            </form>

            {(searchResults.length > 0 || searchError) && (
              <div className="search-results-dropdown">
                {searchError && (
                  <div className="search-error">{searchError}</div>
                )}
                {searchResults.map((r) => (
                  <div
                    key={r.place_id}
                    className="search-result-item"
                    onClick={() => selectSearchResult(r)}
                  >
                    <div className="search-result-name">
                      {r.name || r.display_name.split(",")[0]}
                    </div>
                    <div className="search-result-addr">
                      {r.display_name}
                    </div>
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
          <button
            className={`clear-btn${showRoute ? " active-btn" : ""}`}
            onClick={() => setShowRoute((v) => !v)}
          >
            {showRoute ? "✕ Hide route" : "⟶ Show route"}
          </button>
          <button className="clear-btn" onClick={clearAll}>
            ✕ Clear all pins
          </button>
        </div>

        {pending && (
          <div className="pin-popup">
            <div className="pin-popup-title">📍 New Stop</div>
            <input
              className="pin-popup-input"
              autoFocus
              placeholder="Place name..."
              value={popupName}
              onChange={(e) => setPopupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmPin()}
            />
            <div className="pin-popup-row">
              <label className="pin-popup-label">Time</label>
              <input
                className="pin-popup-input"
                type="time"
                value={popupTime}
                onChange={(e) => setPopupTime(e.target.value)}
              />
            </div>
            <div className="pin-popup-row">
              <label className="pin-popup-label">Type</label>
              <select
                className="pin-popup-select"
                value={popupType}
                onChange={(e) => setPopupType(e.target.value)}
              >
                <option value="">Add Label</option>

                {STOP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <select
              className="pin-popup-select"
              value={popupDay ?? ""}
              onChange={(e) => setPopupDay(+e.target.value)}
            >
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.date}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="pin-popup-btn secondary"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button className="pin-popup-btn" onClick={confirmPin}>
                Add to Itinerary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DayBlock({
  day, pins, highlighted,
  onFocus, onRemovePin, onRemoveDay,
  onDateChange, onAddStop,
  onTimeChange, onNameChange, onNotesChange, onTypeChange,
}) {
  const [input, setInput] = useState("");
  const [time, setTime] = useState("09:00");
  const [type, setType] = useState("");
  const [editingId, setEditingId] = useState(null);

  const stops = (day.stops || [])
    .map((sid) => pins.find((p) => p.id === sid))
    .filter(Boolean)
    .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));

  return (
    <div className="day-block">
      <div className="day-header">
        <div>
          <div className="day-label">{day.label}</div>
          <input
            className="day-date-input"
            type="date"
            value={day.date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>
        <button className="btn-icon" onClick={() => onRemoveDay(day.id)}>
          ✕ remove
        </button>
      </div>

      <div className="stops-list">
        {stops.length === 0 && (
          <div className="empty">No stops yet — click the map or type below</div>
        )}
        {stops.map((s) => (
          <div
            key={s.id}
            className={`stop-item${highlighted === s.id ? " highlighted" : ""}`}
            onClick={() => onFocus(s.id)}
          >
            <div className="stop-num">
              {s.type === "flight"
                ? "✈️"
                : s.type === "hotel"
                ? "🏨"
                : s.type === "food"
                ? "🍜"
                : s.label}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingId === s.id ? (
                <input
                  className="stop-name-input"
                  autoFocus
                  value={s.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onNameChange(s.id, e.target.value);
                  }}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                />
              ) : (
                <div
                  className="stop-name"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(s.id);
                  }}
                  title="Click to edit name"
                >
                  {s.name}
                  <span className="stop-name-edit-hint">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </span>
                </div>
              )}
              <div className="stop-meta">
                <input
                  className="time-input no-cutoff"
                  type="time"
                  value={s.time || "09:00"}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onTimeChange(s.id, e.target.value);
                  }}
                />
                <select
                  className="type-select"
                  value={s.type || ""}
                  required
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onTypeChange(s.id, e.target.value);
                  }}
                >
                  <option value="">Add Label</option>

                  {STOP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className="stop-notes"
                placeholder="Add notes..."
                value={s.notes || ""}
                rows={s.notes ? s.notes.split("\n").length + 1 : 1}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onNotesChange(s.id, e.target.value);
                }}
              />
            </div>
            <button
              className="stop-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemovePin(s.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="add-stop-row">
        <input
          className="add-stop-input"
          placeholder="Stop name..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAddStop(input, time, type);
              setInput("");
            }
          }}
        />
        <input
          className="add-time-input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <select
          className="add-type-select"
          value={type}
          required
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Add Label</option>

          {STOP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <button
          className="btn-add"
          onClick={() => {
            onAddStop(input, time, type);
            setInput("");
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function CostsTab({ pins, days, onCostChange }) {
  const groups = { flight: [], hotel: [], activity: [] };

  days.forEach((day) => {
    (day.stops || []).forEach((sid) => {
      const pin = pins.find((p) => p.id === sid);
      if (!pin) return;
      const t = pin.type || "activity";
      if (groups[t]) groups[t].push({ ...pin, dayLabel: day.label });
    });
  });

  const typeLabels = { flight: "✈ Flights", hotel: "🏨 Hotels", activity: "🎯 Activities" };

  function subtotal(arr) {
    return arr.reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0);
  }

  const grandTotal =
    subtotal(groups.flight) +
    subtotal(groups.hotel) +
    subtotal(groups.activity);

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
                        <input
                          className="cost-input"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={pin.cost || ""}
                          onChange={(e) => onCostChange(pin.id, e.target.value)}
                        />
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