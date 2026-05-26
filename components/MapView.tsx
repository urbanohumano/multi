"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { Coupon } from "@/lib/types";
import { getCategory } from "@/lib/categories";
import { getCoords, VALENCIA_CENTER } from "@/lib/geo";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function MapView({ coupons }: { coupons: Coupon[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const userMarkerRef = useRef<unknown>(null);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: VALENCIA_CENTER,
        zoom: 13,
        zoomControl: false,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // Trigger a relayout in case the container sized after init.
      setTimeout(() => map.invalidateSize(), 100);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Render markers when coupons change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !map || !layer) return;

      layer.clearLayers();
      const points: [number, number][] = [];

      for (const c of coupons) {
        const cat = getCategory(c.category);
        const [lat, lng] = getCoords(c);
        points.push([lat, lng]);

        const icon = L.divIcon({
          className: "vc-pin",
          html: `<div style="
              background:${cat.pin};
              width:34px;height:34px;border-radius:50% 50% 50% 0;
              transform:rotate(-45deg);
              display:flex;align-items:center;justify-content:center;
              box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;">
              <span style="transform:rotate(45deg);font-size:16px;line-height:1;">${cat.emoji}</span>
            </div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
          popupAnchor: [0, -32],
        });

        const popup = `
          <div style="min-width:170px;font-family:system-ui,sans-serif;">
            <div style="font-size:11px;color:#64748b;">${escapeHtml(cat.label)} · ${escapeHtml(c.neighborhood)}</div>
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin:2px 0;">${escapeHtml(c.business)}</div>
            <div style="font-size:12px;color:#334155;">${escapeHtml(c.title)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
              <span style="font-weight:800;color:#ea580c;font-size:15px;">${escapeHtml(c.discountLabel)}</span>
              <a href="/cupon/${encodeURIComponent(c.id)}"
                 style="background:#f97316;color:#fff;padding:5px 10px;border-radius:8px;
                        font-size:12px;font-weight:600;text-decoration:none;">Ver cupón</a>
            </div>
          </div>`;

        L.marker([lat, lng], { icon }).bindPopup(popup).addTo(layer);
      }

      if (points.length > 0) {
        map.fitBounds(points, { padding: [50, 50], maxZoom: 15 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coupons]);

  const locateMe = async () => {
    const L = (await import("leaflet")).default;
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 15);
        if (userMarkerRef.current) {
          (userMarkerRef.current as { remove: () => void }).remove();
        }
        userMarkerRef.current = L.circleMarker([latitude, longitude], {
          radius: 8,
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 1,
          weight: 3,
        }).addTo(map);
      },
      () => {
        // Permiso denegado o no disponible: mantenemos la vista de Valencia.
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={locateMe}
        aria-label="Ir a mi ubicación"
        className="absolute right-3 top-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-md active:scale-95"
      >
        📍
      </button>
    </div>
  );
}
