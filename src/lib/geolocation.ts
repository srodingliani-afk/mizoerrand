import type { MizoramDistrict } from '../shared/types';
import { findNearestMizoramVeng } from '../data/mizoramDistricts';

export type GpsAccuracyQuality = 'high' | 'medium' | 'coarse';

export interface LiveGpsFix {
  lat: number;
  lng: number;
  accuracyMeters: number;
  timestamp: number;
  quality: GpsAccuracyQuality;
}

export interface ResolvedLocationAddress {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  district: MizoramDistrict;
  veng: string;
  landmark: string;
  formattedAddress: string;
  zone: string;
  elevationM: number;
  plusCode?: string;
  isOutsideMizoram: boolean;
  distanceToVengMeters: number;
  source: 'google_geocoding' | 'mizoram_veng_index';
}

export function classifyGpsAccuracy(accuracyMeters: number): GpsAccuracyQuality {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return 'coarse';
  if (accuracyMeters <= 35) return 'high';
  if (accuracyMeters <= 150) return 'medium';
  return 'coarse';
}

export function shouldAcceptGpsUpdate(
  currentBest: LiveGpsFix | null,
  candidate: LiveGpsFix
): boolean {
  if (!currentBest) return true;
  // Always accept if new reading is significantly more accurate
  if (candidate.accuracyMeters <= currentBest.accuracyMeters * 1.15) return true;
  // Also accept if user moved beyond current error radius and fix is reasonably accurate
  const latDiff = Math.abs(candidate.lat - currentBest.lat) * 111000;
  const lngDiff = Math.abs(candidate.lng - currentBest.lng) * 102000;
  const approxMoveMeters = Math.hypot(latDiff, lngDiff);
  if (approxMoveMeters > Math.max(25, candidate.accuracyMeters * 0.5) && candidate.accuracyMeters <= 120) {
    return true;
  }
  // If current fix is stale (>12 seconds), accept fresh reading
  if (candidate.timestamp - currentBest.timestamp > 12000 && candidate.accuracyMeters <= 250) {
    return true;
  }
  return false;
}

export interface LiveLocationWatcher {
  stop: () => void;
}

export function startLiveGpsWatch(
  onFix: (fix: LiveGpsFix) => void,
  onError?: (reason: string) => void,
  options?: { maxAutoRefineMs?: number }
): LiveLocationWatcher {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.('Geolocation is not supported on this device/browser.');
    return { stop: () => {} };
  }

  let stopped = false;
  let bestFix: LiveGpsFix | null = null;
  let watchId: number | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  const handlePosition = (pos: GeolocationPosition) => {
    if (stopped) return;
    const accuracyMeters = Math.round(pos.coords.accuracy || 100);
    const fix: LiveGpsFix = {
      lat: Number(pos.coords.latitude.toFixed(6)),
      lng: Number(pos.coords.longitude.toFixed(6)),
      accuracyMeters,
      timestamp: pos.timestamp || Date.now(),
      quality: classifyGpsAccuracy(accuracyMeters),
    };

    if (shouldAcceptGpsUpdate(bestFix, fix)) {
      bestFix = fix;
      onFix(fix);
    }
  };

  const handleErr = (err: GeolocationPositionError) => {
    if (stopped || bestFix) return;
    if (err.code === 1) {
      onError?.('Location permission denied. Allow GPS in browser site settings or pick on Map.');
    } else if (err.code === 2) {
      onError?.('GPS signal unavailable right now. Tap Map to drop your pin.');
    } else {
      onError?.('GPS lock timed out. Refining signal or pick directly on Map.');
    }
  };

  // Immediate high-accuracy probe + continuous watchPosition refinement
  navigator.geolocation.getCurrentPosition(handlePosition, handleErr, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 8000,
  });

  watchId = navigator.geolocation.watchPosition(handlePosition, handleErr, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  });

  if (options?.maxAutoRefineMs && options.maxAutoRefineMs > 0) {
    stopTimer = setTimeout(() => {
      stop();
    }, options.maxAutoRefineMs);
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
  };

  return { stop };
}

export function buildLocalResolvedAddress(
  lat: number,
  lng: number,
  preferredDistrict?: MizoramDistrict,
  accuracyMeters?: number
): ResolvedLocationAddress {
  const nearest = findNearestMizoramVeng(lat, lng, preferredDistrict);
  const v = nearest.veng;
  const isOutsideMizoram = !nearest.isWithinMizoramBounds;

  const formattedCoords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const landmark = isOutsideMizoram
    ? `GPS Pin (${formattedCoords})`
    : nearest.distanceMeters <= 350
      ? `${v.label} (${v.zone} Zone)`
      : `Near ${v.label} (~${(nearest.distanceMeters / 1000).toFixed(1)} km)`;

  const formattedAddress = isOutsideMizoram
    ? `Pinned GPS (${formattedCoords}) · Nearest Mizoram Hub: ${v.name}, ${v.district}`
    : `${v.name}, ${v.district}, Mizoram (${formattedCoords})`;

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    accuracyMeters,
    district: v.district,
    veng: v.name,
    landmark,
    formattedAddress,
    zone: v.zone,
    elevationM: v.elevationM,
    isOutsideMizoram,
    distanceToVengMeters: nearest.distanceMeters,
    source: 'mizoram_veng_index',
  };
}

export async function resolveAddressFromCoords(
  lat: number,
  lng: number,
  preferredDistrict?: MizoramDistrict,
  accuracyMeters?: number
): Promise<ResolvedLocationAddress> {
  const local = buildLocalResolvedAddress(lat, lng, preferredDistrict, accuracyMeters);

  if (typeof fetch !== 'function') return local;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch(
      `/api/maps/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return local;
    const data = await res.json();
    if (data && typeof data.formattedAddress === 'string' && data.formattedAddress.trim()) {
      return {
        ...local,
        formattedAddress: data.formattedAddress,
        landmark:
          typeof data.landmark === 'string' && data.landmark.trim()
            ? data.landmark
            : local.landmark,
        plusCode: typeof data.plusCode === 'string' ? data.plusCode : undefined,
        source: data.source === 'google_geocoding' ? 'google_geocoding' : local.source,
      };
    }
  } catch {
    // Graceful fallback to instant local Mizoram Veng resolution
  }

  return local;
}
