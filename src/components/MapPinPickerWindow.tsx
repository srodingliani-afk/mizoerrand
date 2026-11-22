import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crosshair, Loader2, MapPin, Navigation, Search } from 'lucide-react';
import type {
  EmergencySosTicket,
  Language,
  LatLng,
  MizoramDistrict,
  PartnerProfile,
} from '../shared/types';
import { getDistrictInfo } from '../data/mizoramDistricts';
import {
  buildLocalResolvedAddress,
  resolveAddressFromCoords,
  startLiveGpsWatch,
  type LiveGpsFix,
  type LiveLocationWatcher,
  type ResolvedLocationAddress,
} from '../lib/geolocation';
import { triggerHaptic } from '../lib/nativeBridge';
import { LayerWindow } from './LayerWindow';
import { MizoramMap, PlacesSearchInput } from './MizoramMap';

export type PinPickerMode = 'pickup' | 'drop' | 'sos';

interface MapPinPickerWindowProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  apiKey: string;
  initialMode: PinPickerMode;
  district: MizoramDistrict;
  origin?: LatLng;
  destination?: LatLng;
  partners: PartnerProfile[];
  sosTickets?: EmergencySosTicket[];
  onConfirmLocation: (mode: PinPickerMode, resolved: ResolvedLocationAddress) => void;
}

export const MapPinPickerWindow: React.FC<MapPinPickerWindowProps> = ({
  open,
  onClose,
  lang,
  apiKey,
  initialMode,
  district,
  origin,
  destination,
  partners,
  sosTickets,
  onConfirmLocation,
}) => {
  const [mode, setMode] = useState<PinPickerMode>(initialMode);
  const [draftPin, setDraftPin] = useState<LatLng | null>(null);
  const [resolved, setResolved] = useState<ResolvedLocationAddress | null>(null);
  const [customLandmarkDraft, setCustomLandmarkDraft] = useState('');
  const [resolving, setResolving] = useState(false);

  const [liveTracking, setLiveTracking] = useState(false);
  const [liveFix, setLiveFix] = useState<LiveGpsFix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watcherRef = useRef<LiveLocationWatcher | null>(null);

  const districtInfo = getDistrictInfo(resolved?.district || district);

  const resolveCoords = useCallback(
    async (lat: number, lng: number, accuracyMeters?: number, customLabel?: string) => {
      const instant = buildLocalResolvedAddress(lat, lng, district, accuracyMeters);
      if (customLabel) {
        instant.landmark = customLabel;
      }
      setResolved(instant);
      setCustomLandmarkDraft(instant.landmark);
      setDraftPin({ lat: instant.lat, lng: instant.lng, label: instant.veng });

      setResolving(true);
      try {
        const enriched = await resolveAddressFromCoords(lat, lng, district, accuracyMeters);
        if (customLabel) {
          enriched.landmark = customLabel;
        }
        setResolved(enriched);
        setCustomLandmarkDraft(enriched.landmark);
        setDraftPin({ lat: enriched.lat, lng: enriched.lng, label: enriched.veng });
      } finally {
        setResolving(false);
      }
    },
    [district]
  );

  const stopGps = useCallback(() => {
    watcherRef.current?.stop();
    watcherRef.current = null;
    setLiveTracking(false);
  }, []);

  const startGps = useCallback(() => {
    stopGps();
    setGpsError(null);
    setLiveTracking(true);
    triggerHaptic('medium');
    watcherRef.current = startLiveGpsWatch(
      (fix) => {
        setLiveFix(fix);
        setGpsError(null);
        void resolveCoords(fix.lat, fix.lng, fix.accuracyMeters);
      },
      (errMsg) => {
        setGpsError(errMsg);
        setLiveTracking(false);
      }
    );
  }, [resolveCoords, stopGps]);

  useEffect(() => {
    if (!open) {
      stopGps();
      return;
    }
    setMode(initialMode);
    setGpsError(null);
    const seed =
      initialMode === 'pickup'
        ? origin || districtInfo.center
        : initialMode === 'drop'
          ? destination || districtInfo.vengs[1] || districtInfo.center
          : districtInfo.center;
    void resolveCoords(seed.lat, seed.lng);

    return () => {
      stopGps();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  const handleSwitchMode = (nextMode: PinPickerMode) => {
    triggerHaptic('light');
    stopGps();
    setMode(nextMode);
    const seed =
      nextMode === 'pickup'
        ? origin || districtInfo.center
        : nextMode === 'drop'
          ? destination || districtInfo.vengs[1] || districtInfo.center
          : districtInfo.center;
    void resolveCoords(seed.lat, seed.lng);
  };

  const handleConfirm = () => {
    if (!resolved) return;
    triggerHaptic('success');
    stopGps();
    const finalResolved: ResolvedLocationAddress = {
      ...resolved,
      landmark: customLandmarkDraft.trim() || resolved.landmark,
    };
    onConfirmLocation(mode, finalResolved);
    onClose();
  };

  const mapDistrict = resolved && !resolved.isOutsideMizoram ? resolved.district : district;
  const activeDistrictVengs = getDistrictInfo(mapDistrict).vengs;

  return (
    <LayerWindow
      open={open}
      onClose={() => {
        stopGps();
        onClose();
      }}
      layerLevel={2}
      size="lg"
      accent={mode === 'sos' ? 'danger' : 'default'}
      title={
        mode === 'pickup'
          ? lang === 'miz'
            ? 'Map-ah Pickup Hmun Pin Rawh (A)'
            : 'Pin Pickup Location on Map (A)'
          : mode === 'sos'
            ? lang === 'miz'
              ? 'SOS Hmun Map-ah Pin Rawh (!)'
              : 'Pin Emergency SOS Location (!)'
            : lang === 'miz'
              ? 'Map-ah Drop Hmun Pin Rawh (B)'
              : 'Pin Drop Location on Map (B)'
      }
      subtitle={
        lang === 'miz'
          ? 'Map hmet emaw pin hnuk la, Veng leh address a in fill auto nghal ang'
          : 'Tap map or drag pin — District, Veng & landmark auto-fill instantly'
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
              {resolved
                ? `${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`
                : 'Select location on map'}
            </p>
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {resolved
                ? `${resolved.veng} (${resolved.district})`
                : lang === 'miz'
                  ? 'Hmun thlan mek...'
                  : 'Locating...'}
            </p>
          </div>
          <button
            type="button"
            disabled={!resolved}
            onClick={handleConfirm}
            className={`min-h-[48px] rounded-2xl px-5 py-2.5 text-sm font-bold text-white inline-flex items-center gap-2 shrink-0 disabled:opacity-40 transition-all ${
              mode === 'sos'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-800 hover:bg-emerald-900'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>
              {lang === 'miz' ? 'Confirm Pin & Auto-Fill' : 'Confirm Pin & Auto-Fill'}
            </span>
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Top Switcher (Pickup A vs Drop B) + Live GPS Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {initialMode !== 'sos' ? (
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => handleSwitchMode('pickup')}
                className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  mode === 'pickup'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'miz' ? 'Pickup Pin (A)' : 'Pickup Pin (A)'}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('drop')}
                className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  mode === 'drop'
                    ? 'bg-slate-900 dark:bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'miz' ? 'Drop Pin (B)' : 'Drop Pin (B)'}
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400">
              <MapPin className="w-4 h-4" />
              {lang === 'miz' ? 'Emergency Location Pin' : 'Emergency Location Pin'}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              if (liveTracking) {
                stopGps();
              } else {
                startGps();
              }
            }}
            className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              liveTracking
                ? 'bg-sky-600 text-white shadow-sm'
                : 'border border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 hover:bg-emerald-100'
            }`}
          >
            {liveTracking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {liveFix
                    ? `Live GPS ±${liveFix.accuracyMeters}m`
                    : lang === 'miz'
                      ? 'GPS Zawn mek...'
                      : 'Locking Live GPS...'}
                </span>
              </>
            ) : (
              <>
                <Crosshair className="w-3.5 h-3.5" />
                <span>{lang === 'miz' ? 'My Live GPS Hmang' : 'Use My Live GPS'}</span>
              </>
            )}
          </button>
        </div>

        {/* Search Landmark / Place Input */}
        <div className="relative flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1">
            <PlacesSearchInput
              apiKey={apiKey}
              district={mapDistrict}
              placeholder={
                lang === 'miz'
                  ? `Hmun hming zawng rawh (${mapDistrict})...`
                  : `Search Veng, church, market or landmark in ${mapDistrict}...`
              }
              onSelect={(place) => {
                stopGps();
                void resolveCoords(place.lat, place.lng, undefined, place.label);
              }}
            />
          </div>
        </div>

        {gpsError && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
            {gpsError}
          </div>
        )}

        {/* Interactive Pin Map (Google Maps JS + Interactive SVG Terrain Fallback) */}
        <MizoramMap
          apiKey={apiKey}
          district={mapDistrict}
          districtCenter={districtInfo.center}
          districtVengs={activeDistrictVengs}
          origin={origin}
          destination={destination}
          partners={partners}
          sosTickets={sosTickets}
          interactivePinMode={mode}
          selectedPin={draftPin}
          liveUserGps={liveFix}
          heightClass="h-[38dvh] min-h-[240px]"
          onMapPickCoords={(coords) => {
            stopGps();
            triggerHaptic('light');
            void resolveCoords(coords.lat, coords.lng);
          }}
        />

        {/* Live Auto-Filled Address Preview & Landmark Editor */}
        {resolved && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-400">
                <Navigation className="w-3.5 h-3.5" />
                <span>
                  {lang === 'miz' ? 'Auto-Fill Address:' : 'Auto-Resolved Address:'}{' '}
                  {resolved.veng} · {resolved.district}
                </span>
                {resolving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {resolved.accuracyMeters ? `±${resolved.accuracyMeters}m · ` : ''}
                {resolved.source === 'google_geocoding' ? 'Google Geocoded' : `${resolved.zone} Zone`}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {resolved.formattedAddress}
              {resolved.plusCode ? ` · Plus Code: ${resolved.plusCode}` : ''}
            </p>

            <div>
              <label
                htmlFor="pin-picker-landmark"
                className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
              >
                {lang === 'miz'
                  ? 'Landmark / Biak In / In Awmna (Auto-filled, a thlak theih)'
                  : 'Auto-Filled Landmark / Gate Note (Editable)'}
              </label>
              <input
                id="pin-picker-landmark"
                type="text"
                value={customLandmarkDraft}
                onChange={(e) => setCustomLandmarkDraft(e.target.value)}
                className="w-full min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </LayerWindow>
  );
};
