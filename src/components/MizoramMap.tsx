import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import type { EmergencySosTicket, LatLng, MizoramDistrict, PartnerProfile } from '../shared/types';
import {
  ALL_MIZORAM_VENGS,
  MIZORAM_DISTRICTS,
  getDistrictInfo,
  type DistrictVengPoint,
} from '../data/mizoramDistricts';

interface MizoramMapProps {
  apiKey: string;
  district?: MizoramDistrict;
  districtCenter?: LatLng;
  districtVengs?: DistrictVengPoint[];
  origin?: LatLng;
  stops?: LatLng[];
  destination?: LatLng;
  partners: PartnerProfile[];
  sosTickets?: EmergencySosTicket[];
  heightClass?: string;
  onPlaceSelected?: (place: { label: string; lat: number; lng: number }) => void;
}

const DEFAULT_MIZORAM_CENTER = { lat: 23.7295, lng: 92.7176 };

function isValidGoogleMapsKey(key: string): boolean {
  const trimmed = (key || '').trim();
  return (
    trimmed.length >= 30 &&
    trimmed.startsWith('AIza') &&
    !/your_|placeholder|example|dummy/i.test(trimmed)
  );
}

class MapsErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Gracefully switch to local Mizoram fallback without surfacing an unhandled Script error.
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function MapCameraController({
  district,
  districtCenter,
  hasRoute,
}: {
  district: MizoramDistrict;
  districtCenter: LatLng;
  hasRoute: boolean;
}) {
  const map = useMap();
  const prevDistrictRef = useRef<MizoramDistrict>(district);

  useEffect(() => {
    if (!map) return;
    const districtChanged = prevDistrictRef.current !== district;
    prevDistrictRef.current = district;
    if (districtChanged || !hasRoute) {
      map.panTo({ lat: districtCenter.lat, lng: districtCenter.lng });
      map.setZoom(13);
    }
  }, [map, district, districtCenter.lat, districtCenter.lng, hasRoute]);

  return null;
}

function RoutesPolylineLayer({
  origin,
  stops,
  destination,
}: {
  origin?: LatLng;
  stops?: LatLng[];
  destination?: LatLng;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const intermediates = (stops || []).map((s) => ({
      location: { lat: s.lat, lng: s.lng },
    }));

    const request = {
      origin: { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      ...(intermediates.length > 0 ? { intermediates } : {}),
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    const computeRoutesFn = (
      routesLib?.Route as unknown as {
        computeRoutes?: (req: unknown) => Promise<{
          routes?: Array<{
            createPolylines?: () => google.maps.Polyline[];
            viewport?: google.maps.LatLngBounds;
          }>;
        }>;
      }
    )?.computeRoutes;

    if (typeof computeRoutesFn !== 'function') return;

    let cancelled = false;
    computeRoutesFn(request)
      .then((res) => {
        if (cancelled || !res?.routes || res.routes.length === 0) return;
        const primary = res.routes[0];
        if (!primary || typeof primary.createPolylines !== 'function') return;
        const lines = primary.createPolylines();
        lines.forEach((line) => {
          line.setOptions({
            strokeColor: '#0F766E',
            strokeWeight: 5,
            strokeOpacity: 0.9,
          });
          line.setMap(map);
        });
        polylinesRef.current = lines;
        if (primary.viewport) {
          map.fitBounds(primary.viewport);
        }
      })
      .catch((err: unknown) => {
        const msg = String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin, stops, destination]);

  return null;
}

function LocalVengSearchInput({
  district = 'Aizawl',
  placeholder,
  onSelect,
}: {
  district?: MizoramDistrict;
  placeholder: string;
  onSelect: (place: { label: string; lat: number; lng: number }) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ label: string; lat: number; lng: number }>>([]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const val = e.target.value;
          setQuery(val);
          if (!val.trim()) {
            setResults([]);
            return;
          }
          const qLower = val.toLowerCase();
          const matched = ALL_MIZORAM_VENGS.filter(
            (v) =>
              v.name.toLowerCase().includes(qLower) ||
              (v.label || '').toLowerCase().includes(qLower) ||
              v.district.toLowerCase().includes(qLower)
          )
            .sort((a, b) => (a.district === district ? -1 : b.district === district ? 1 : 0))
            .slice(0, 8)
            .map((v) => ({ label: `${v.name} (${v.district}) · ${v.label}`, lat: v.lat, lng: v.lng }));
          setResults(matched);
        }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
      />
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onSelect({ label: r.label, lat: r.lat, lng: r.lng });
                  setQuery(r.label);
                  setResults([]);
                }}
                className="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlacesSearchInput({
  apiKey,
  district = 'Aizawl',
  placeholder,
  onSelect,
}: {
  apiKey: string;
  district?: MizoramDistrict;
  placeholder: string;
  onSelect: (place: { label: string; lat: number; lng: number }) => void;
}) {
  const cleanKey = (apiKey || '').trim();
  const [useLocalFallback, setUseLocalFallback] = useState(!isValidGoogleMapsKey(cleanKey));

  useEffect(() => {
    setUseLocalFallback(!isValidGoogleMapsKey(cleanKey));
  }, [cleanKey]);

  useEffect(() => {
    const onAuthFailure = () => setUseLocalFallback(true);
    window.addEventListener('gmp-auth-failure', onAuthFailure);
    return () => window.removeEventListener('gmp-auth-failure', onAuthFailure);
  }, []);

  if (useLocalFallback || !isValidGoogleMapsKey(cleanKey)) {
    return (
      <LocalVengSearchInput district={district} placeholder={placeholder} onSelect={onSelect} />
    );
  }

  return (
    <MapsErrorBoundary
      fallback={
        <LocalVengSearchInput district={district} placeholder={placeholder} onSelect={onSelect} />
      }
    >
      <APIProvider apiKey={cleanKey} libraries={['places']} language="en" region="IN">
        <GooglePlacesAutocompleteInner
          district={district}
          placeholder={placeholder}
          onSelect={onSelect}
          onFallback={() => setUseLocalFallback(true)}
        />
      </APIProvider>
    </MapsErrorBoundary>
  );
}

function GooglePlacesAutocompleteInner({
  district,
  placeholder,
  onSelect,
  onFallback,
}: {
  district: MizoramDistrict;
  placeholder: string;
  onSelect: (place: { label: string; lat: number; lng: number }) => void;
  onFallback: () => void;
}) {
  const status = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onFallback();
    }
  }, [status, onFallback]);

  useEffect(() => {
    if (!placesLib || !query.trim()) {
      setSuggestions([]);
      return;
    }
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!AutocompleteSuggestion || typeof AutocompleteSuggestion.fetchAutocompleteSuggestions !== 'function') {
      return;
    }
    if (!sessionTokenRef.current && AutocompleteSessionToken) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }
    let active = true;
    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: `${query}, ${district}, Mizoram`,
      sessionToken: sessionTokenRef.current || undefined,
    })
      .then((res) => {
        if (active) setSuggestions(res?.suggestions || []);
      })
      .catch((err: unknown) => {
        const msg = String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          onFallback();
        }
        if (active) setSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [placesLib, query, district, onFallback]);

  const pickSuggestion = async (s: google.maps.places.AutocompleteSuggestion) => {
    if (!s.placePrediction) return;
    try {
      const place = s.placePrediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      const loc = place.location;
      if (loc) {
        const label = place.displayName || s.placePrediction.text.text;
        onSelect({ label, lat: loc.lat(), lng: loc.lng() });
        setQuery(label);
      }
    } catch (err: unknown) {
      const msg = String(err);
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('429') ||
        msg.includes('OVER_QUERY_LIMIT')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void pickSuggestion(s)}
                className="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
              >
                {s.placePrediction?.text.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoogleMapInner({
  district = 'Aizawl',
  districtCenter,
  origin,
  stops,
  destination,
  partners,
  sosTickets = [],
  onFallback,
}: Omit<MizoramMapProps, 'apiKey' | 'heightClass'> & { onFallback: () => void }) {
  const status = useApiLoadingStatus();
  const [selectedPartner, setSelectedPartner] = useState<PartnerProfile | null>(null);
  const center = districtCenter || getDistrictInfo(district).center || DEFAULT_MIZORAM_CENTER;

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onFallback();
    }
  }, [status, onFallback]);

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={origin || center}
      defaultZoom={13}
      gestureHandling="greedy"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
    >
      <MapCameraController
        district={district}
        districtCenter={center}
        hasRoute={Boolean(origin && destination)}
      />
      <RoutesPolylineLayer origin={origin} stops={stops} destination={destination} />

      {origin && (
        <AdvancedMarker position={origin} title={origin.label || 'Pickup'}>
          <Pin background="#0F766E" borderColor="#115E59" glyphColor="#FFFFFF" glyphText="A" />
        </AdvancedMarker>
      )}
      {(stops || []).map((s, idx) => (
        <AdvancedMarker key={`stop-${idx}`} position={s} title={s.label || `Stop ${idx + 1}`}>
          <Pin background="#D97706" borderColor="#B45309" glyphColor="#FFFFFF" glyphText={String(idx + 1)} />
        </AdvancedMarker>
      ))}
      {destination && (
        <AdvancedMarker position={destination} title={destination.label || 'Drop'}>
          <Pin background="#0F172A" borderColor="#020617" glyphColor="#FFFFFF" glyphText="B" />
        </AdvancedMarker>
      )}

      {partners.map((p) => (
        <AdvancedMarker
          key={p.id}
          position={{ lat: p.lat, lng: p.lng }}
          title={`${p.name} (${p.category} · ${p.district || district})`}
          onClick={() => setSelectedPartner(p)}
        >
          <Pin
            background={p.online ? (p.category === 'walker' ? '#059669' : '#0284C7') : '#94A3B8'}
            borderColor="#FFFFFF"
            glyphColor="#FFFFFF"
            glyphText={p.category[0].toUpperCase()}
          />
        </AdvancedMarker>
      ))}

      {sosTickets
        .filter((t) => t.status !== 'resolved')
        .map((t) => (
          <AdvancedMarker key={t.id} position={{ lat: t.lat, lng: t.lng }} title={`SOS: ${t.veng}`}>
            <Pin background="#DC2626" borderColor="#991B1B" glyphColor="#FFFFFF" glyphText="!" />
          </AdvancedMarker>
        ))}

      {selectedPartner && (
        <InfoWindow
          position={{ lat: selectedPartner.lat, lng: selectedPartner.lng }}
          onCloseClick={() => setSelectedPartner(null)}
        >
          <div className="p-1 text-xs text-slate-900">
            <p className="font-semibold">{selectedPartner.name}</p>
            <p className="text-slate-600">
              {selectedPartner.category} · {selectedPartner.veng} ({selectedPartner.district || district}) · ★ {selectedPartner.rating}
            </p>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

/**
 * Interactive Mizoram District Hill Terrain Topology SVG fallback when Maps API key is unavailable or blocked.
 */
function DistrictTerrainVectorMap({
  district = 'Aizawl',
  districtVengs,
  origin,
  stops = [],
  destination,
  partners,
  sosTickets = [],
}: Omit<MizoramMapProps, 'apiKey' | 'heightClass'>) {
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const districtInfo = getDistrictInfo(district);
  const activeVengs = districtVengs && districtVengs.length > 0 ? districtVengs : districtInfo.vengs;

  const waypoints = [origin, ...stops, destination].filter(Boolean) as LatLng[];
  const isInterDistrictSpan =
    waypoints.length >= 2 &&
    (Math.abs(waypoints[0].lat - waypoints[waypoints.length - 1].lat) > 0.2 ||
      Math.abs(waypoints[0].lng - waypoints[waypoints.length - 1].lng) > 0.2);

  const visiblePartners = isInterDistrictSpan
    ? partners
    : partners.filter((p) => !p.district || p.district === district);
  const visibleSos = isInterDistrictSpan
    ? sosTickets.filter((t) => t.status !== 'resolved')
    : sosTickets.filter((t) => t.status !== 'resolved' && (!t.district || t.district === district));

  const referenceNodes = isInterDistrictSpan
    ? MIZORAM_DISTRICTS.map((d) => ({ name: d.district, lat: d.center.lat, lng: d.center.lng }))
    : activeVengs;

  const allPoints: LatLng[] = [
    ...referenceNodes,
    ...waypoints,
    ...visiblePartners.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...visibleSos.map((t) => ({ lat: t.lat, lng: t.lng })),
  ];

  const rawMinLat = Math.min(...allPoints.map((p) => p.lat));
  const rawMaxLat = Math.max(...allPoints.map((p) => p.lat));
  const rawMinLng = Math.min(...allPoints.map((p) => p.lng));
  const rawMaxLng = Math.max(...allPoints.map((p) => p.lng));

  const latPad = Math.max(0.008, (rawMaxLat - rawMinLat) * 0.2);
  const lngPad = Math.max(0.008, (rawMaxLng - rawMinLng) * 0.2);
  const minLat = rawMinLat - latPad;
  const maxLat = rawMaxLat + latPad;
  const minLng = rawMinLng - lngPad;
  const maxLng = rawMaxLng + lngPad;

  const project = (pt: LatLng) => {
    const x = ((pt.lng - minLng) / (maxLng - minLng || 0.02)) * 680 + 40;
    const y = (1 - (pt.lat - minLat) / (maxLat - minLat || 0.02)) * 280 + 30;
    return {
      x: Math.max(24, Math.min(736, x)),
      y: Math.max(24, Math.min(316, y)),
    };
  };

  const pathPoints = waypoints.map(project);
  const pathD =
    pathPoints.length > 1
      ? pathPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ')
      : '';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <svg
        viewBox="0 0 760 340"
        className="h-full w-full"
        role="img"
        aria-label={`${district} Hill Terrain Live Operations Map`}
      >
        <defs>
          <linearGradient id="hillShade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ECFEFF" />
            <stop offset="55%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
        </defs>
        <rect width="760" height="340" fill="url(#hillShade)" />
        {/* Topographic contour lines representing Mizoram ridge lines */}
        <path d="M 40 290 Q 220 210 380 180 T 720 60" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="5 5" />
        <path d="M 60 320 Q 260 250 430 210 T 740 110" fill="none" stroke="#CBD5E1" strokeWidth="1" />
        <path d="M 20 220 Q 200 140 360 120 T 700 30" fill="none" stroke="#CBD5E1" strokeWidth="1" />

        {/* 500m PostGIS ST_DWithin corridor envelope */}
        {pathD && (
          <>
            <path d={pathD} fill="none" stroke="#0F766E" strokeOpacity="0.16" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
            <path d={pathD} fill="none" stroke="#0F766E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* Veng or District Capital Reference Nodes */}
        {referenceNodes.map((v) => {
          const p = project(v);
          const showLabel =
            referenceNodes.length <= 16 || ('isHub' in v && Boolean(v.isHub));
          const infoText =
            'zone' in v
              ? `${v.name} · ${v.zone} Zone (${v.elevationM}m)`
              : `${v.name} District Hub`;
          return (
            <g
              key={v.name}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onClick={() => setHoveredInfo(infoText)}
            >
              <circle r={showLabel ? '3.5' : '2.2'} fill={showLabel ? '#475569' : '#94A3B8'} />
              {showLabel && (
                <text x="6" y="3" fontSize="10" fill="#475569" fontWeight="500">
                  {v.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Origin / Stops / Destination */}
        {pathPoints.map((pt, i) => {
          const isFirst = i === 0;
          const isLast = i === pathPoints.length - 1;
          const fill = isFirst ? '#0F766E' : isLast ? '#0F172A' : '#D97706';
          const label = isFirst ? 'A' : isLast ? 'B' : String(i);
          return (
            <g key={`wp-${i}`} transform={`translate(${pt.x}, ${pt.y})`}>
              <circle r="11" fill={fill} stroke="#FFFFFF" strokeWidth="2" />
              <text textAnchor="middle" dy="3.5" fontSize="10" fill="#FFFFFF" fontWeight="700">
                {label}
              </text>
            </g>
          );
        })}

        {/* Live Partners */}
        {visiblePartners.map((partner) => {
          const p = project({ lat: partner.lat, lng: partner.lng });
          const color = !partner.online
            ? '#94A3B8'
            : partner.category === 'walker'
              ? '#059669'
              : partner.category === 'bike'
                ? '#0284C7'
                : partner.category === 'auto_taxi'
                  ? '#D97706'
                  : '#7C3AED';
          return (
            <g
              key={partner.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onClick={() =>
                setHoveredInfo(
                  `${partner.name} · ${partner.category.toUpperCase()} · ${partner.veng} (${partner.district || district}) · ★ ${partner.rating}`
                )
              }
            >
              <circle r="9" fill={color} stroke="#FFFFFF" strokeWidth="2" />
              <text textAnchor="middle" dy="3.5" fontSize="9" fill="#FFFFFF" fontWeight="700">
                {partner.category[0].toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Active 24x7 SOS Markers */}
        {visibleSos.map((t) => {
          const p = project({ lat: t.lat, lng: t.lng });
          return (
            <g
              key={t.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onClick={() =>
                setHoveredInfo(`24x7 SOS · ${t.veng} (${t.district || district}) · ${t.category} (${t.assignedTechName})`)
              }
            >
              <circle r="16" fill="#DC2626" fillOpacity="0.22" />
              <circle r="10" fill="#DC2626" stroke="#FFFFFF" strokeWidth="2" />
              <text textAnchor="middle" dy="3.5" fontSize="11" fill="#FFFFFF" fontWeight="800">
                !
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-[11px] text-slate-700 backdrop-blur-sm border border-slate-200">
        <span>
          {hoveredInfo ||
            `${isInterDistrictSpan ? 'All-Mizoram State Corridor' : `${district} (${districtInfo.rtoCode}, ${districtInfo.elevationM}m)`} · PostGIS ST_DWithin 500m Envelope`}
        </span>
        <span className="font-mono text-slate-500">
          W:Walker · B:Bike · A:Auto · P:Pickup · !:SOS
        </span>
      </div>
    </div>
  );
}

export const MizoramMap: React.FC<MizoramMapProps> = ({
  apiKey,
  district = 'Aizawl',
  districtCenter,
  districtVengs,
  origin,
  stops,
  destination,
  partners,
  sosTickets,
  heightClass = 'h-72 lg:h-80',
}) => {
  const cleanKey = (apiKey || '').trim();
  const [useFallback, setUseFallback] = useState(!isValidGoogleMapsKey(cleanKey));

  useEffect(() => {
    setUseFallback(!isValidGoogleMapsKey(cleanKey));
  }, [cleanKey]);

  useEffect(() => {
    const onAuthFailure = () => setUseFallback(true);
    window.addEventListener('gmp-auth-failure', onAuthFailure);
    return () => window.removeEventListener('gmp-auth-failure', onAuthFailure);
  }, []);

  const fallbackElement = (
    <DistrictTerrainVectorMap
      district={district}
      districtVengs={districtVengs}
      origin={origin}
      stops={stops}
      destination={destination}
      partners={partners}
      sosTickets={sosTickets}
    />
  );

  return (
    <div className={`w-full ${heightClass} rounded-xl overflow-hidden`} data-testid="mizoram-map-container">
      {!useFallback && isValidGoogleMapsKey(cleanKey) ? (
        <MapsErrorBoundary fallback={fallbackElement}>
          <APIProvider apiKey={cleanKey} libraries={['places', 'routes', 'marker']} language="en" region="IN">
            <GoogleMapInner
              district={district}
              districtCenter={districtCenter}
              origin={origin}
              stops={stops}
              destination={destination}
              partners={partners}
              sosTickets={sosTickets}
              onFallback={() => setUseFallback(true)}
            />
          </APIProvider>
        </MapsErrorBoundary>
      ) : (
        fallbackElement
      )}
    </div>
  );
};
