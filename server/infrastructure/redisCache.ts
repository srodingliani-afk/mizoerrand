interface CachedCoordinate {
  partnerId: string;
  lat: number;
  lng: number;
  online: boolean;
  updatedAt: number;
  expiresAt: number;
}

/**
 * Sub-second live GPS & online status cache mirroring Upstash Redis TTL semantics.
 */
class LiveGpsRedisCache {
  private readonly store = new globalThis.Map<string, CachedCoordinate>();
  private readonly defaultTtlMs = 45_000;

  setPartnerLocation(
    partnerId: string,
    lat: number,
    lng: number,
    online: boolean,
    ttlMs = this.defaultTtlMs
  ): CachedCoordinate {
    const now = Date.now();
    const record: CachedCoordinate = {
      partnerId,
      lat,
      lng,
      online,
      updatedAt: now,
      expiresAt: now + ttlMs,
    };
    this.store.set(`gps:${partnerId}`, record);
    return record;
  }

  getPartnerLocation(partnerId: string): CachedCoordinate | null {
    const entry = this.store.get(`gps:${partnerId}`);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(`gps:${partnerId}`);
      return null;
    }
    return entry;
  }

  getAllActiveCoordinates(): CachedCoordinate[] {
    const now = Date.now();
    const active: CachedCoordinate[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      } else if (entry.online) {
        active.push(entry);
      }
    }
    return active;
  }
}

export const liveGpsCache = new LiveGpsRedisCache();
