import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const DAY_COLORS = [
  "#c8f55a", "#7eb3ff", "#ff9f7e",
  "#e878b8", "#78e8c8", "#ffcc55",
  "#ff8888", "#aaaaff"
];

function makeIcon(label, color) {
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
        font-size:9px;
        font-weight:700;
        border:2px solid rgba(0,0,0,0.25)
      ">
        <span style="transform:rotate(45deg)">${label}</span>
      </div>
    `,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -32],
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

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// Sort stops within each day by time, then assign global sequential labels
function reindexPins(days, pins) {
  // Build a list of pin IDs sorted by time within each day
  const orderedIds = days.flatMap((day) => {
    const dayPins = day.stops
      .map((sid) => pins.find((p) => p.id === sid))
      .filter(Boolean)
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
    return dayPins.map((p) => p.id);
  });

  return pins.map((pin) => {
    const pos = orderedIds.indexOf(pin.id);
    return { ...pin, label: pos >= 0 ? String(pos + 1) : "?" };
  });
}

export default function App() {
  const saved = load();

  const [tripName, setTripName] = useState(saved?.tripName || "Japan 2025");

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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});
  const daysRef = useRef(days);
  const pinsRef = useRef(pins);

  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  // Persist on every change
  useEffect(() => {
    save({ tripName, days, pins, nextDayId, nextPinId });
  }, [tripName, days, pins, nextDayId, nextPinId]);

  // Refresh all marker labels whenever pins or days change
  useEffect(() => {
    const indexed = reindexPins(days, pins);
    indexed.forEach((pin) => {
      if (markersRef.current[pin.id] && pin.lat !== null) {
        const dayIdx = days.findIndex((d) => d.id === pin.dayId);
        const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
        markersRef.current[pin.id].setIcon(makeIcon(pin.label, color));
      }
    });
  }, [pins, days]);

  // Init map once
  useEffect(() => {
    if (leafletMap.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView([35.68, 139.69], 5);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Light mode tile layer
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "© OpenStreetMap © CARTO",
        maxZoom: 19,
      }
    ).addTo(map);

    map.on("click", (e) => {
      setPending({ lat: +e.latlng.lat.toFixed(4), lng: +e.latlng.lng.toFixed(4) });
      setPopupName("");
      setPopupTime("09:00");
      setPopupDay(daysRef.current[0]?.id ?? null);
    });

    leafletMap.current = map;

    // Restore saved markers
    const indexed = reindexPins(pinsRef.current, pinsRef.current);
    indexed.forEach((pin) => {
      if (pin.lat !== null) {
        addMarkerToMap(pin, daysRef.current, map);
      }
    });
  }, []);

  function addMarkerToMap(pin, currentDays, map) {
    const m = map || leafletMap.current;
    const dayIdx = currentDays.findIndex((d) => d.id === pin.dayId);
    const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
    const marker = L.marker([pin.lat, pin.lng], {
      icon: makeIcon(pin.label ?? pin.id, color),
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
    addMarkerToMap(
      newPins.find((p) => p.id === pin.id),
      newDays
    );
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
    const newPins = reindexPins(
      newDays,
      pins.filter((p) => p.id !== pinId)
    );
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
      ? addDays(lastDay.date, 1)
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
    if (day) day.stops.forEach((sid) => removePin(sid));
    setDays((ds) => ds.filter((d) => d.id !== dayId));
  }

  function addManualStop(dayId, name, time) {
    if (!name.trim()) return;
    const pin = {
      id: nextPinId,
      label: "?",
      name: name.trim(),
      time: time || "09:00",
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
    // Update the time then reindex so order reflects the new time
    const updatedPins = pins.map((p) => (p.id === pinId ? { ...p, time } : p));
    const reindexed = reindexPins(days, updatedPins);
    setPins(reindexed);
  }

  function focusPin(pinId) {
    setHighlighted(pinId);
    const pin = pins.find((p) => p.id === pinId);
    if (pin?.lat !== null && pin?.lat !== undefined) {
      leafletMap.current?.setView([pin.lat, pin.lng], 12, { animate: true });
    }
  }

  // Place search using Nominatim
  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

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
    // Pre-fill popup with the place name
    const shortName = result.name || result.display_name.split(",")[0];
    setPending({ lat, lng });
    setPopupName(shortName);
    setPopupTime("09:00");
    setPopupDay(daysRef.current[0]?.id ?? null);
    setSearchResults([]);
    setSearchQuery("");
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="app-title">✈ Trip Planner</div>
          <input
            className="trip-name-input"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            placeholder="Name your trip..."
          />
        </div>

        <div className="tabs">
          <button
            className={`tab${tab === "itinerary" ? " active" : ""}`}
            onClick={() => setTab("itinerary")}
          >
            Itinerary
          </button>
          <button
            className={`tab${tab === "pins" ? " active" : ""}`}
            onClick={() => setTab("pins")}
          >
            All Pins
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
                  onAddStop={(name, time) => addManualStop(day.id, name, time)}
                  onTimeChange={updateStopTime}
                />
              ))}
              <button className="add-day-btn" onClick={addDay}>
                + Add Day
              </button>
            </>
          ) : (
            <PinsTab
              pins={pins}
              days={days}
              onFocus={focusPin}
              onRemove={removePin}
            />
          )}
        </div>
      </div>

      <div className="map-area">
        <div ref={mapRef} id="map" />

        {/* Search bar */}
        <div className="map-search-bar" style={{ position: "absolute", top: 16, left: 16, zIndex: 1000 }}>
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
            <strong>Click map to drop pin</strong>
            Name it and assign to a day
          </div>
          <button className="clear-btn" onClick={clearAll}>
            ✕ Clear all pins
          </button>
        </div>

        {pending && (
          <div className="pin-popup">
            <div className="pin-popup-title">📍 New Stop</div>
            <div className="pin-popup-coords">
              {pending.lat}, {pending.lng}
            </div>
            <input
              className="pin-popup-input"
              autoFocus
              placeholder="Place name e.g. Shibuya Crossing"
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
  day,
  pins,
  highlighted,
  onFocus,
  onRemovePin,
  onRemoveDay,
  onDateChange,
  onAddStop,
  onTimeChange,
}) {
  const [input, setInput] = useState("");
  const [time, setTime] = useState("09:00");

  // Sort stops by time for display
  const stops = day.stops
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
            <div className="stop-num">{s.label}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="stop-name">{s.name}</div>
              <div className="stop-meta">
                <input
                  className="time-input"
                  type="time"
                  value={s.time || "09:00"}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onTimeChange(s.id, e.target.value);
                  }}
                />
                {s.lat !== null ? ` · ${s.lat}, ${s.lng}` : " · no map pin"}
              </div>
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
              onAddStop(input, time);
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
        <button
          className="btn-add"
          onClick={() => {
            onAddStop(input, time);
            setInput("");
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function PinsTab({ pins, days, onFocus, onRemove }) {
  if (!pins.length) {
    return (
      <div className="hint">
        <span>Click anywhere on the map</span> to drop a pin and assign it to a day.
      </div>
    );
  }

  return (
    <div className="pins-list">
      {pins.map((pin) => {
        const day = days.find((d) => d.id === pin.dayId);
        return (
          <div key={pin.id} className="pin-item" onClick={() => onFocus(pin.id)}>
            <div className="pin-num">{pin.label}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pin-name">{pin.name}</div>
              <div className="pin-coords">
                {day?.label ?? "?"} · {pin.time} ·{" "}
                {pin.lat !== null ? `${pin.lat}, ${pin.lng}` : "no coords"}
              </div>
            </div>
            <button
              className="stop-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(pin.id);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}