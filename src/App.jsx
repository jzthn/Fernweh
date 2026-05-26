import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const DAY_COLORS = ["#c8f55a","#7eb3ff","#ff9f7e","#e878b8","#78e8c8","#ffcc55","#ff8888","#aaaaff"];

function makeIcon(num, color) {
  return L.divIcon({
    html: `<div style="background:${color};color:#0f0f13;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid rgba(0,0,0,0.25)"><span style="transform:rotate(45deg)">${num}</span></div>`,
    className: "", iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -32],
  });
}

function load() {
  try {
    const raw = localStorage.getItem("tripplanner");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(data) {
  localStorage.setItem("tripplanner", JSON.stringify(data));
}

export default function App() {
  const saved = load();
  const [tripName, setTripName] = useState(saved?.tripName || "Japan 2025");
  const [days, setDays] = useState(saved?.days || [
    { id: 1, label: "Day 1", date: "2025-09-01", stops: [] },
    { id: 2, label: "Day 2", date: "2025-09-02", stops: [] },
  ]);
  const [pins, setPins] = useState(saved?.pins || []);
  const [nextDayId, setNextDayId] = useState(saved?.nextDayId || 3);
  const [nextPinId, setNextPinId] = useState(saved?.nextPinId || 1);
  const [tab, setTab] = useState("itinerary");
  const [highlighted, setHighlighted] = useState(null);
  const [pending, setPending] = useState(null);
  const [popupName, setPopupName] = useState("");
  const [popupDay, setPopupDay] = useState(null);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});
  const nextPinIdRef = useRef(nextPinId);
  const daysRef = useRef(days);
  const pinsRef = useRef(pins);

  // keep refs in sync
  useEffect(() => { nextPinIdRef.current = nextPinId; }, [nextPinId]);
  useEffect(() => { daysRef.current = days; }, [days]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  // save to localStorage whenever state changes
  useEffect(() => {
    save({ tripName, days, pins, nextDayId, nextPinId });
  }, [tripName, days, pins, nextDayId, nextPinId]);

  // init map once
  useEffect(() => {
    if (leafletMap.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView([35.68, 139.69], 5);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO", maxZoom: 19,
    }).addTo(map);
    map.on("click", (e) => {
      setPending({ lat: +e.latlng.lat.toFixed(4), lng: +e.latlng.lng.toFixed(4) });
      setPopupName("");
      setPopupDay(daysRef.current[0]?.id ?? null);
    });
    leafletMap.current = map;

    // restore saved markers
    pinsRef.current.forEach((pin) => {
      if (pin.lat !== null) addMarkerToMap(pin, daysRef.current, map);
    });
  }, []);

  function addMarkerToMap(pin, currentDays, map) {
    const m = map || leafletMap.current;
    const dayIdx = currentDays.findIndex((d) => d.id === pin.dayId);
    const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
    const marker = L.marker([pin.lat, pin.lng], { icon: makeIcon(pin.id, color) });
    marker.on("click", () => {
      setHighlighted(pin.id);
      leafletMap.current.setView([pin.lat, pin.lng], 12, { animate: true });
    });
    marker.addTo(m);
    markersRef.current[pin.id] = marker;
  }

  function confirmPin() {
    if (!pending) return;
    const name = popupName.trim() || `Stop ${nextPinIdRef.current}`;
    const dayId = popupDay ?? days[0]?.id;
    const pin = { id: nextPinIdRef.current, name, lat: pending.lat, lng: pending.lng, dayId };
    const newPins = [...pinsRef.current, pin];
    const newDays = daysRef.current.map((d) =>
      d.id === dayId ? { ...d, stops: [...d.stops, pin.id] } : d
    );
    setPins(newPins);
    setDays(newDays);
    setNextPinId((n) => n + 1);
    addMarkerToMap(pin, newDays);
    setPending(null);
  }

  function removePin(pinId) {
    if (markersRef.current[pinId]) {
      markersRef.current[pinId].remove();
      delete markersRef.current[pinId];
    }
    setPins((p) => p.filter((x) => x.id !== pinId));
    setDays((ds) => ds.map((d) => ({ ...d, stops: d.stops.filter((s) => s !== pinId) })));
  }

  function clearAll() {
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    setPins([]);
    setDays((ds) => ds.map((d) => ({ ...d, stops: [] })));
  }

  function addDay() {
    const n = days.length + 1;
    const d = new Date();
    d.setDate(d.getDate() + days.length);
    setDays([...days, { id: nextDayId, label: `Day ${n}`, date: d.toISOString().split("T")[0], stops: [] }]);
    setNextDayId((x) => x + 1);
  }

  function removeDay(dayId) {
    const day = days.find((d) => d.id === dayId);
    if (day) day.stops.forEach((sid) => removePin(sid));
    setDays((ds) => ds.filter((d) => d.id !== dayId));
  }

  function addManualStop(dayId, name) {
    if (!name.trim()) return;
    const pin = { id: nextPinId, name: name.trim(), lat: null, lng: null, dayId };
    setPins((p) => [...p, pin]);
    setDays((ds) => ds.map((d) => d.id === dayId ? { ...d, stops: [...d.stops, pin.id] } : d));
    setNextPinId((n) => n + 1);
  }

  function focusPin(pinId) {
    setHighlighted(pinId);
    const pin = pins.find((p) => p.id === pinId);
    if (pin?.lat !== null) leafletMap.current?.setView([pin.lat, pin.lng], 12, { animate: true });
  }

  return (
    <div className="app">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="app-title">✈ Trip Planner</div>
          <input className="trip-name-input" value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder="Name your trip..." />
        </div>
        <div className="tabs">
          <button className={`tab${tab === "itinerary" ? " active" : ""}`} onClick={() => setTab("itinerary")}>Itinerary</button>
          <button className={`tab${tab === "pins" ? " active" : ""}`} onClick={() => setTab("pins")}>All Pins</button>
        </div>
        <div className="sidebar-body">
          {tab === "itinerary" ? (
            <>
              {days.map((day) => (
                <DayBlock key={day.id} day={day} pins={pins} highlighted={highlighted}
                  onFocus={focusPin} onRemovePin={removePin} onRemoveDay={removeDay}
                  onDateChange={(date) => setDays(days.map((d) => d.id === day.id ? { ...d, date } : d))}
                  onAddStop={(name) => addManualStop(day.id, name)} />
              ))}
              <button className="add-day-btn" onClick={addDay}>+ Add Day</button>
            </>
          ) : (
            <PinsTab pins={pins} days={days} onFocus={focusPin} onRemove={removePin} />
          )}
        </div>
      </div>

      {/* MAP */}
      <div className="map-area">
        <div ref={mapRef} id="map" />
        <div className="map-overlay">
          <div className="map-badge"><strong>Click map to drop pin</strong>Name it and assign to a day</div>
          <button className="clear-btn" onClick={clearAll}>✕ Clear all pins</button>
        </div>

        {/* PIN POPUP */}
        {pending && (
          <div className="pin-popup">
            <div className="pin-popup-title">📍 New Stop</div>
            <div className="pin-popup-coords">{pending.lat}, {pending.lng}</div>
            <input className="pin-popup-input" autoFocus placeholder="Place name e.g. Shibuya Crossing"
              value={popupName} onChange={(e) => setPopupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmPin()} />
            <select className="pin-popup-select" value={popupDay ?? ""} onChange={(e) => setPopupDay(+e.target.value)}>
              {days.map((d) => <option key={d.id} value={d.id}>{d.label} — {d.date}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="pin-popup-btn secondary" onClick={() => setPending(null)}>Cancel</button>
              <button className="pin-popup-btn" onClick={confirmPin}>Add to Itinerary</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DayBlock({ day, pins, highlighted, onFocus, onRemovePin, onRemoveDay, onDateChange, onAddStop }) {
  const [input, setInput] = useState("");
  const stops = day.stops.map((sid) => pins.find((p) => p.id === sid)).filter(Boolean);

  return (
    <div className="day-block">
      <div className="day-header">
        <div>
          <div className="day-label">{day.label}</div>
          <input className="day-date-input" type="date" value={day.date} onChange={(e) => onDateChange(e.target.value)} />
        </div>
        <button className="btn-icon" onClick={() => onRemoveDay(day.id)}>✕ remove</button>
      </div>
      <div className="stops-list">
        {stops.length === 0 && <div className="empty">No stops yet — click the map or type below</div>}
        {stops.map((s) => (
          <div key={s.id} className={`stop-item${highlighted === s.id ? " highlighted" : ""}`} onClick={() => onFocus(s.id)}>
            <div className="stop-dot" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="stop-name">{s.name}</div>
              <div className="stop-meta">{s.lat !== null ? `${s.lat}, ${s.lng}` : "no map pin"}</div>
            </div>
            <button className="stop-remove" onClick={(e) => { e.stopPropagation(); onRemovePin(s.id); }}>✕</button>
          </div>
        ))}
      </div>
      <div className="add-stop-row">
        <input className="add-stop-input" placeholder="Type a stop name..." value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onAddStop(input); setInput(""); } }} />
        <button className="btn-add" onClick={() => { onAddStop(input); setInput(""); }}>+</button>
      </div>
    </div>
  );
}

function PinsTab({ pins, days, onFocus, onRemove }) {
  if (!pins.length) return <div className="hint"><span>Click anywhere on the map</span> to drop a pin and assign it to a day.</div>;
  return (
    <div className="pins-list">
      {pins.map((pin) => {
        const day = days.find((d) => d.id === pin.dayId);
        return (
          <div key={pin.id} className="pin-item" onClick={() => onFocus(pin.id)}>
            <div className="pin-num">{pin.id}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pin-name">{pin.name}</div>
              <div className="pin-coords">{day?.label ?? "?"} · {pin.lat !== null ? `${pin.lat}, ${pin.lng}` : "no coords"}</div>
            </div>
            <button className="stop-remove" onClick={(e) => { e.stopPropagation(); onRemove(pin.id); }}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
