import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Home,
  Hospital,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  X,
} from 'lucide-react';
import type {
  EmergencyCategory,
  ErrandJobType,
  Language,
  MarketplaceProduct,
  MizoramDistrict,
  SavedPlace,
  WorkforceMember,
} from '../shared/types';
import { getDistrictInfo } from '../data/mizoramDistricts';
import { triggerHaptic } from '../lib/nativeBridge';
import { getDistrictSavedPlaces } from '../lib/userSettings';
import { LayerWindow } from './LayerWindow';

interface UniversalSearchBarProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  products: MarketplaceProduct[];
  workforce: WorkforceMember[];
  savedPlaces: SavedPlace[];
  onAddSavedPlace: (place: SavedPlace) => void;
  onSelectSavedPlace: (place: SavedPlace) => void;
  onSelectProduct: (product: MarketplaceProduct) => void;
  onSelectWorker: (worker: WorkforceMember) => void;
  onSelectQuickErrand: (jobType: ErrandJobType, presetTitle?: string) => void;
  onSelectSosCategory: (cat: EmergencyCategory) => void;
}

const QUICK_SERVICES: Array<{
  id: ErrandJobType;
  labelEn: string;
  labelMiz: string;
  keywords: string;
  presetMiz: string;
}> = [
  {
    id: 'step_delivery',
    labelEn: 'On-Foot Runner (Steps & Bazaar)',
    labelMiz: 'Runner (Kailawn & Bazar Thil Lak)',
    keywords: 'runner walker errand gas cylinder bazar steps tirhkah delivery',
    presetMiz: 'Bazar thil lak leh in thleng dah',
  },
  {
    id: 'bike_express',
    labelEn: '2-Wheeler Express Parcel',
    labelMiz: 'Bike Express Thil Thawn',
    keywords: 'bike express pharmacy damdawi urgent document parcel',
    presetMiz: 'Damdawi leh thil pawimawh rang taka lam',
  },
  {
    id: 'auto_cab_ride',
    labelEn: 'Local Taxi / Auto Ride',
    labelMiz: 'Taxi / Auto Kohna',
    keywords: 'taxi auto cab hospital airport ride lengpui',
    presetMiz: 'Taxi kohna',
  },
  {
    id: 'heavy_cargo_shift',
    labelEn: 'Pickup Cargo & House Shift',
    labelMiz: 'Pickup Bungraw Thiar',
    keywords: 'pickup truck cargo shifting furniture rice gas sumo',
    presetMiz: 'Pickup bungraw thiar',
  },
];

const SOS_SEARCH_ITEMS: Array<{
  cat: EmergencyCategory;
  labelEn: string;
  labelMiz: string;
  keywords: string;
}> = [
  { cat: 'ambulance_oxygen', labelEn: 'Ambulance & Oxygen Support', labelMiz: 'Ambulance & Oxygen', keywords: 'ambulance oxygen emergency hospital' },
  { cat: 'night_pharmacy_run', labelEn: '24x7 Night Pharmacy Run', labelMiz: 'Zan Damdawi Lei', keywords: 'pharmacy damdawi medicine night' },
  { cat: 'lpg_gas_leak', labelEn: 'LPG Gas Leak Technician', labelMiz: 'Gas Put Siamtu', keywords: 'lpg gas leak cylinder stove' },
  { cat: 'plumber_water', labelEn: 'Emergency Plumber & Pipe Burst', labelMiz: 'Tui Pipe Siamtu', keywords: 'plumber water pipe tank leak' },
  { cat: 'electrician_power', labelEn: 'Power / Short-Circuit Electrician', labelMiz: 'Electrician (Current)', keywords: 'electrician power short circuit fuse' },
  { cat: 'landslide_drain_clear', labelEn: 'Landslide & Drain Emergency', labelMiz: 'Leimin & Tui Luankawr', keywords: 'landslide leimin drain flood rain' },
  { cat: 'water_tanker_urgent', labelEn: 'Urgent Water Tanker', labelMiz: 'Tui Tanker Kohna', keywords: 'water tanker tui' },
  { cat: 'women_night_escort', labelEn: 'Safe Women Night Escort', labelMiz: 'Zan Himna Escort', keywords: 'women escort safe night taxi' },
];

function getPlaceIcon(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes('home') || lower.includes('in')) return <Home className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />;
  if (lower.includes('office') || lower.includes('work')) return <Building2 className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />;
  if (lower.includes('hospital') || lower.includes('clinic')) return <Hospital className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />;
  if (lower.includes('bazar') || lower.includes('market')) return <Store className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />;
  return <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />;
}

export const UniversalSearchBar: React.FC<UniversalSearchBarProps> = ({
  lang,
  selectedDistrict,
  products,
  workforce,
  savedPlaces,
  onAddSavedPlace,
  onSelectSavedPlace,
  onSelectProduct,
  onSelectWorker,
  onSelectQuickErrand,
  onSelectSosCategory,
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newVeng, setNewVeng] = useState('');
  const [newLandmark, setNewLandmark] = useState('');

  const districtInfo = useMemo(() => getDistrictInfo(selectedDistrict), [selectedDistrict]);
  const districtSavedPlaces = useMemo(
    () => getDistrictSavedPlaces(selectedDistrict, savedPlaces),
    [selectedDistrict, savedPlaces]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const matchedProducts = products
      .filter(
        (p) =>
          p.titleEn.toLowerCase().includes(q) ||
          p.titleMiz.toLowerCase().includes(q) ||
          p.shopName.toLowerCase().includes(q) ||
          p.veng.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const aLocal = (a.district || 'Aizawl') === selectedDistrict ? 0 : 1;
        const bLocal = (b.district || 'Aizawl') === selectedDistrict ? 0 : 1;
        return aLocal - bLocal;
      })
      .slice(0, 4);

    const matchedWorkers = workforce
      .filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.roleTitle.toLowerCase().includes(q) ||
          w.roleTitleMiz.toLowerCase().includes(q) ||
          w.skills.some((s) => s.toLowerCase().includes(q)) ||
          'awmpui driver caregiver'.includes(q)
      )
      .slice(0, 3);

    const matchedServices = QUICK_SERVICES.filter(
      (s) =>
        s.labelEn.toLowerCase().includes(q) ||
        s.labelMiz.toLowerCase().includes(q) ||
        s.keywords.includes(q)
    ).slice(0, 3);

    const matchedSos = SOS_SEARCH_ITEMS.filter(
      (s) =>
        s.labelEn.toLowerCase().includes(q) ||
        s.labelMiz.toLowerCase().includes(q) ||
        s.keywords.includes(q)
    ).slice(0, 3);

    const total =
      matchedProducts.length +
      matchedWorkers.length +
      matchedServices.length +
      matchedSos.length;

    return { matchedProducts, matchedWorkers, matchedServices, matchedSos, total };
  }, [query, products, workforce]);

  const handleSaveNewPlace = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    const veng = newVeng.trim() || districtInfo.vengs[0]?.name || selectedDistrict;
    if (!label) return;
    triggerHaptic('booking');
    onAddSavedPlace({
      id: `plc-${Date.now()}`,
      label,
      district: selectedDistrict,
      veng,
      landmark: newLandmark.trim() || undefined,
    });
    setNewLabel('');
    setNewVeng('');
    setNewLandmark('');
    setAddOpen(false);
  };

  return (
    <div className="space-y-2.5">
      {/* Universal Live Search Input */}
      <div className="relative">
        <div
          className={`flex items-center gap-2.5 rounded-2xl bg-white dark:bg-slate-900 border px-3.5 min-h-[48px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-colors ${
            focused
              ? 'border-emerald-700 dark:border-emerald-500 ring-2 ring-emerald-700/15'
              : 'border-slate-200/80 dark:border-slate-800'
          }`}
        >
          <Search className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <input
            type="text"
            role="searchbox"
            value={query}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 180)}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={
              lang === 'miz'
                ? 'Runner, Bazar thil, Awmpui leh Damdawi zawnna'
                : 'Search Runners, Bazaar items, Awmpui, or SOS'
            }
            placeholder={
              lang === 'miz'
                ? `${selectedDistrict}: Runner, Bazar, Awmpui, SOS...`
                : `Search ${selectedDistrict}: Runner, Bazar, Awmpui, SOS`
            }
            className="w-full bg-transparent py-2.5 text-[13px] sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Instant Categorized Dropdown Results */}
        {results && (focused || query.trim().length > 0) && (
          <div className="absolute left-0 right-0 top-[54px] z-30 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {results.total === 0 ? (
              <div className="p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-3">
                <span>
                  {lang === 'miz'
                    ? `"${query}" hmuh a ni lo — Runner ko mai rawh`
                    : `No exact catalog match for "${query}" — send a Runner`}
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    triggerHaptic('light');
                    onSelectQuickErrand('step_delivery', query.trim());
                    setQuery('');
                  }}
                  className="rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0"
                >
                  {lang === 'miz' ? 'Runner Ko' : 'Book Runner'}
                </button>
              </div>
            ) : (
              <>
                {results.matchedServices.length > 0 && (
                  <div className="p-2">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {lang === 'miz' ? 'Runner & Motor' : 'Quick Errands & Rides'}
                    </p>
                    {results.matchedServices.map((svc) => (
                      <button
                        key={svc.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          triggerHaptic('light');
                          onSelectQuickErrand(svc.id, lang === 'miz' ? svc.presetMiz : svc.labelEn);
                          setQuery('');
                        }}
                        className="w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                          <Truck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          {lang === 'miz' ? svc.labelMiz : svc.labelEn}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {lang === 'miz' ? 'Book' : 'Open'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {results.matchedProducts.length > 0 && (
                  <div className="p-2">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {lang === 'miz' ? 'En Hmasak Bazar' : 'Local Bazaar'}
                    </p>
                    {results.matchedProducts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          triggerHaptic('light');
                          onSelectProduct(item);
                          setQuery('');
                        }}
                        className="w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ShoppingBag className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {lang === 'miz' ? item.titleMiz : item.titleEn}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {item.shopName} · {item.veng}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-400 shrink-0">
                          ₹{item.price}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {results.matchedWorkers.length > 0 && (
                  <div className="p-2">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {lang === 'miz' ? 'Awmpui & Driver' : 'Verified Awmpui & Staff'}
                    </p>
                    {results.matchedWorkers.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          triggerHaptic('light');
                          onSelectWorker(w);
                          setQuery('');
                        }}
                        className="w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Briefcase className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {w.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {lang === 'miz' ? w.roleTitleMiz : w.roleTitle} · {w.veng}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 font-mono tabular-nums shrink-0">
                          {w.rating}★
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {results.matchedSos.length > 0 && (
                  <div className="p-2">
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-500">
                      {lang === 'miz' ? '24×7 Emergency SOS' : '24×7 Rapid SOS'}
                    </p>
                    {results.matchedSos.map((sos) => (
                      <button
                        key={sos.cat}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          triggerHaptic('sos');
                          onSelectSosCategory(sos.cat);
                          setQuery('');
                        }}
                        className="w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {lang === 'miz' ? sos.labelMiz : sos.labelEn}
                        </span>
                        <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                          SOS
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 1-Tap Saved Favourite Places Strip (Synchronized to active District) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
        {districtSavedPlaces.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onSelectSavedPlace(place);
            }}
            className="inline-flex items-center gap-1.5 min-h-[38px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-700 dark:hover:border-emerald-500 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
          >
            {getPlaceIcon(place.label)}
            <span>{place.label}</span>
            <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
              · {place.veng}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setNewVeng(districtInfo.vengs[0]?.name || selectedDistrict);
            setAddOpen(true);
          }}
          className="inline-flex items-center gap-1 min-h-[38px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-emerald-700 hover:text-emerald-800 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          {lang === 'miz' ? 'Hmun Dah Belh' : 'Save Place'}
        </button>
      </div>

      {/* Add Saved Place LayerWindow */}
      <LayerWindow
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={lang === 'miz' ? 'Hmun Hman Zin Dah Belh' : 'Save a Favourite Place'}
        subtitle={`${selectedDistrict} · ${lang === 'miz' ? 'Tap 1-in order address dah luhna' : '1-tap pre-fill on errands & rides'}`}
        size="sm"
        footer={
          <button
            type="submit"
            form="zorun-save-place-form"
            className="w-full min-h-[46px] rounded-2xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 inline-flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {lang === 'miz' ? 'Hmun Save Rawh' : 'Save Place'}
          </button>
        }
      >
        <form id="zorun-save-place-form" onSubmit={handleSaveNewPlace} className="space-y-3.5">
          <div>
            <label htmlFor="save-place-label" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {lang === 'miz' ? 'Hming (e.g. Nu In, Biak In, School)' : 'Short Label (e.g. Mom’s House, College)'}
            </label>
            <input
              id="save-place-label"
              type="text"
              required
              maxLength={32}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={lang === 'miz' ? 'Entirnan: Biak In' : 'e.g. Synod Hospital'}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="save-place-veng" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {lang === 'miz' ? `${selectedDistrict} Veng` : `Veng in ${selectedDistrict}`}
            </label>
            <select
              id="save-place-veng"
              value={newVeng}
              onChange={(e) => setNewVeng(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
            >
              {districtInfo.vengs.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="save-place-landmark" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {lang === 'miz' ? 'Chhinchhiahna (Optional)' : 'Landmark Note (Optional)'}
            </label>
            <input
              id="save-place-landmark"
              type="text"
              maxLength={80}
              value={newLandmark}
              onChange={(e) => setNewLandmark(e.target.value)}
              placeholder={lang === 'miz' ? 'Kailawn bul, gate hring' : 'Near concrete steps, green gate'}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-emerald-700 focus:outline-none"
            />
          </div>
        </form>
      </LayerWindow>
    </div>
  );
};
