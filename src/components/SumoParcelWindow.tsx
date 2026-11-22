import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, CheckCircle2, Package, Receipt, ShoppingBag, Truck } from 'lucide-react';
import type { Language, MizoramDistrict, SumoParcelBooking } from '../shared/types';
import { ALL_MIZORAM_DISTRICT_NAMES, getDistrictInfo } from '../data/mizoramDistricts';
import {
  AIZAWL_PROXY_MARKETS,
  DISTRICT_SUMO_COUNTERS,
  calculateSumoParcelFare,
} from '../../server/domain/premiumRules';
import { compressImageToWebP } from '../lib/offlineCache';
import { dataUrlToBlob, uploadMediaFile } from '../lib/mediaUpload';
import { triggerHaptic } from '../lib/nativeBridge';
import { LayerWindow } from './LayerWindow';
import { CameraCaptureModal } from './CameraCaptureModal';

interface SumoParcelWindowProps {
  open: boolean;
  onClose: () => void;
  lang: Language;
  selectedDistrict: MizoramDistrict;
  plusPassActive: boolean;
  parcels: SumoParcelBooking[];
  onBooked: () => Promise<void>;
}

const STATUS_LABELS: Record<SumoParcelBooking['status'], { en: string; miz: string }> = {
  pickup_scheduled: { en: 'Runner Assigned', miz: 'Runner Ruat Tawh' },
  at_sumo_counter: { en: 'Dropped at Sumo Counter', miz: 'Sumo Counter-ah Dah Tawh' },
  in_transit: { en: 'Sumo In Transit', miz: 'Kawngah Kal Mek' },
  delivered: { en: 'Delivered to Receiver', miz: 'Dawngtu Hnenah Pek Fel' },
};

export const SumoParcelWindow: React.FC<SumoParcelWindowProps> = ({
  open,
  onClose,
  lang,
  selectedDistrict,
  plusPassActive,
  parcels,
  onBooked,
}) => {
  const defaultMode: 'parcel_bridge' | 'proxy_shopping' =
    selectedDistrict !== 'Aizawl' ? 'proxy_shopping' : 'parcel_bridge';
  const [bookingMode, setBookingMode] = useState<'parcel_bridge' | 'proxy_shopping'>(defaultMode);

  const defaultDest: MizoramDistrict = selectedDistrict === 'Aizawl' ? 'Lunglei' : 'Aizawl';
  const [originDistrict, setOriginDistrict] = useState<MizoramDistrict>(selectedDistrict);
  const [destinationDistrict, setDestinationDistrict] = useState<MizoramDistrict>(defaultDest);
  const [originCounter, setOriginCounter] = useState<string>(
    DISTRICT_SUMO_COUNTERS[selectedDistrict][0]
  );
  const [destinationCounter, setDestinationCounter] = useState<string>(
    DISTRICT_SUMO_COUNTERS[defaultDest][0]
  );
  const [shoppingMarket, setShoppingMarket] = useState<string>(AIZAWL_PROXY_MARKETS[0]);
  const [estimatedItemBudgetRs, setEstimatedItemBudgetRs] = useState<number>(1200);
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string>('');
  const [senderName, setSenderName] = useState('Malsawmkimi');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [parcelDescription, setParcelDescription] = useState('');
  const [weightKg, setWeightKg] = useState(3);
  const [includeHomeDrop, setIncludeHomeDrop] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [uploadingReceiptId, setUploadingReceiptId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<
    null | { mode: 'new' } | { mode: 'existing'; parcelId: string }
  >(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Globally synchronize Sumo Counter districts whenever selectedDistrict or mode changes
  useEffect(() => {
    if (bookingMode === 'proxy_shopping') {
      const targetOuter: MizoramDistrict =
        selectedDistrict === 'Aizawl' ? 'Lunglei' : selectedDistrict;
      setOriginDistrict('Aizawl');
      setOriginCounter(DISTRICT_SUMO_COUNTERS.Aizawl[0]);
      setDestinationDistrict(targetOuter);
      setDestinationCounter(DISTRICT_SUMO_COUNTERS[targetOuter][0]);
    } else {
      const nextDest: MizoramDistrict = selectedDistrict === 'Aizawl' ? 'Lunglei' : 'Aizawl';
      setOriginDistrict(selectedDistrict);
      setOriginCounter(DISTRICT_SUMO_COUNTERS[selectedDistrict][0]);
      setDestinationDistrict(nextDest);
      setDestinationCounter(DISTRICT_SUMO_COUNTERS[nextDest][0]);
    }
  }, [selectedDistrict, bookingMode]);

  const effectiveOrigin: MizoramDistrict =
    bookingMode === 'proxy_shopping' ? 'Aizawl' : originDistrict;
  const originCounters = DISTRICT_SUMO_COUNTERS[effectiveOrigin] || [];
  const destCounters = DISTRICT_SUMO_COUNTERS[destinationDistrict] || [];
  const originInfo = useMemo(() => getDistrictInfo(effectiveOrigin), [effectiveOrigin]);

  const fare = useMemo(
    () =>
      calculateSumoParcelFare({
        bookingMode,
        originDistrict: effectiveOrigin,
        destinationDistrict,
        weightKg,
        includeHomeDrop,
        estimatedItemBudgetRs: bookingMode === 'proxy_shopping' ? estimatedItemBudgetRs : undefined,
        plusPassActive,
      }),
    [
      bookingMode,
      effectiveOrigin,
      destinationDistrict,
      weightKg,
      includeHomeDrop,
      estimatedItemBudgetRs,
      plusPassActive,
    ]
  );

  const handleOriginChange = (next: MizoramDistrict) => {
    setOriginDistrict(next);
    setOriginCounter(DISTRICT_SUMO_COUNTERS[next][0]);
    if (next === destinationDistrict) {
      const alt = ALL_MIZORAM_DISTRICT_NAMES.find((d) => d !== next) || 'Lunglei';
      setDestinationDistrict(alt);
      setDestinationCounter(DISTRICT_SUMO_COUNTERS[alt][0]);
    }
  };

  const handleDestChange = (next: MizoramDistrict) => {
    setDestinationDistrict(next);
    setDestinationCounter(DISTRICT_SUMO_COUNTERS[next][0]);
  };

  const handleNewReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webpDataUrl = await compressImageToWebP(file, 900);
      const blob = await dataUrlToBlob(webpDataUrl);
      const uploaded = await uploadMediaFile({
        file: blob,
        filename: `receipt-${Date.now()}.webp`,
        category: 'receipt',
        district: destinationDistrict,
      });
      setReceiptPhotoUrl(uploaded.url || webpDataUrl);
    } catch {
      setFeedback({ type: 'err', msg: 'Could not upload receipt photo.' });
    }
  };

  const handleAttachExistingReceipt = async (
    parcelId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceiptId(parcelId);
    try {
      const webpDataUrl = await compressImageToWebP(file, 900);
      const blob = await dataUrlToBlob(webpDataUrl);
      const uploaded = await uploadMediaFile({
        file: blob,
        filename: `receipt-${parcelId}.webp`,
        category: 'receipt',
        district: destinationDistrict,
        orderRef: parcelId,
      });
      const res = await fetch(`/api/premium/sumo-parcels/${parcelId}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptPhotoUrl: uploaded.url || webpDataUrl }),
      });
      if (res.ok) {
        triggerHaptic('success');
        await onBooked();
      }
    } finally {
      setUploadingReceiptId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    triggerHaptic('booking');

    try {
      const res = await fetch('/api/premium/sumo-parcels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingMode,
          senderName,
          receiverName,
          receiverPhone,
          originDistrict: effectiveOrigin,
          originVeng:
            bookingMode === 'proxy_shopping'
              ? shoppingMarket
              : originInfo.vengs[0]?.name || effectiveOrigin,
          originCounter,
          destinationDistrict,
          destinationCounter,
          parcelDescription,
          shoppingMarket: bookingMode === 'proxy_shopping' ? shoppingMarket : undefined,
          estimatedItemBudgetRs:
            bookingMode === 'proxy_shopping' ? estimatedItemBudgetRs : undefined,
          receiptPhotoUrl: receiptPhotoUrl || undefined,
          weightKg,
          includeHomeDrop,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', msg: data.error || 'Could not book Sumo request.' });
      } else {
        setReceiverName('');
        setReceiverPhone('');
        setParcelDescription('');
        setReceiptPhotoUrl('');
        setFeedback({
          type: 'ok',
          msg:
            bookingMode === 'proxy_shopping'
              ? lang === 'miz'
                ? `Aizawl Proxy Shopping Book Fel! ${data.parcel.trackingCode} · ${destinationDistrict} Sumo Counter (₹${data.parcel.allInclusiveTotal})`
                : `Buy & Send booked! Tracking ${data.parcel.trackingCode} · Aizawl Runner will buy & drop at ${destinationDistrict} Sumo Counter.`
              : lang === 'miz'
                ? `Sumo Parcel Book Fel! Tracking: ${data.parcel.trackingCode} (₹${data.parcel.allInclusiveTotal})`
                : `Sumo Parcel booked! Tracking ${data.parcel.trackingCode} · All-inclusive ₹${data.parcel.allInclusiveTotal}`,
        });
        await onBooked();
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Network error booking Sumo parcel.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (id: string) => {
    setAdvancingId(id);
    triggerHaptic('light');
    try {
      await fetch(`/api/premium/sumo-parcels/${id}/advance`, { method: 'POST' });
      await onBooked();
    } finally {
      setAdvancingId(null);
    }
  };

  return (
    <LayerWindow
      open={open}
      onClose={onClose}
      title={
        bookingMode === 'proxy_shopping'
          ? lang === 'miz'
            ? 'Aizawl Bazar Lei & Sumo-a Thawn'
            : 'Buy & Send via Sumo (Proxy Shop)'
          : lang === 'miz'
            ? 'District Dang Sumo Parcel Bridge'
            : 'Inter-District Sumo Parcel Bridge'
      }
      subtitle={
        bookingMode === 'proxy_shopping'
          ? lang === 'miz'
            ? 'Aizawl Runner-in a lei ang → Receipt thlalak → I District Sumo Counter-ah dah'
            : 'Aizawl Runner buys from market → Uploads receipt photo → Drops at your Sumo Counter'
          : lang === 'miz'
            ? 'In atanga lam → Sumo Counter → District dang thleng'
            : 'Home Runner pickup → Sumo Counter handover → Destination drop'
      }
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {bookingMode === 'proxy_shopping'
                ? lang === 'miz'
                  ? 'Budget + Proxy + Sumo Total'
                  : 'Escrow Total (incl. Budget)'
                : lang === 'miz'
                  ? 'Man Belhkhawm (All-Inclusive)'
                  : 'All-Inclusive Bridge Fare'}{' '}
              · ~{fare.estimatedHours}h
            </p>
            <p className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
              ₹{fare.allInclusiveTotal.toLocaleString()}
            </p>
          </div>
          <button
            type="submit"
            form="zorun-sumo-parcel-form"
            disabled={submitting || effectiveOrigin === destinationDistrict}
            className="flex-1 min-h-[48px] rounded-2xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900 active:scale-[0.98] disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
          >
            {bookingMode === 'proxy_shopping' ? (
              <ShoppingBag className="w-4 h-4" />
            ) : (
              <Package className="w-4 h-4" />
            )}
            {submitting
              ? lang === 'miz'
                ? 'Book mek...'
                : 'Booking...'
              : bookingMode === 'proxy_shopping'
                ? lang === 'miz'
                  ? 'Aizawl Runner Lei Tir Rawh'
                  : 'Request Buy & Send'
                : lang === 'miz'
                  ? 'Sumo Parcel Book Rawh'
                  : 'Book Sumo Parcel'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Mode Switch: Standard Sumo Parcel Bridge vs Reverse Buy & Send Proxy Shopping */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setBookingMode('parcel_bridge');
              setFeedback(null);
            }}
            className={`min-h-[42px] rounded-xl px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
              bookingMode === 'parcel_bridge'
                ? 'bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'miz' ? 'Thil Thawn (Parcel)' : 'Send Parcel'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setBookingMode('proxy_shopping');
              setFeedback(null);
            }}
            className={`min-h-[42px] rounded-xl px-3 py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
              bookingMode === 'proxy_shopping'
                ? 'bg-emerald-900 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span>{lang === 'miz' ? 'Lei & Sumo-a Thawn' : 'Buy & Send via Sumo'}</span>
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className={`rounded-2xl px-4 py-3 text-xs font-semibold ${
              feedback.type === 'ok'
                ? 'bg-emerald-900 text-white'
                : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        <form id="zorun-sumo-parcel-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Corridor & Market Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 p-3.5">
            {bookingMode === 'proxy_shopping' ? (
              <div className="space-y-2">
                <label
                  htmlFor="sumo-proxy-market"
                  className="block text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400"
                >
                  {lang === 'miz' ? 'Aizawl Bazar / Dawr Hmun' : 'Aizawl Buying Market'}
                </label>
                <select
                  id="sumo-proxy-market"
                  value={shoppingMarket}
                  onChange={(e) => setShoppingMarket(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  {AIZAWL_PROXY_MARKETS.map((mkt) => (
                    <option key={mkt} value={mkt}>
                      {mkt}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Aizawl Dispatch Sumo Counter"
                  value={originCounter}
                  onChange={(e) => setOriginCounter(e.target.value)}
                  className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                >
                  {originCounters.map((c) => (
                    <option key={c} value={c}>
                      Drop at: {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor="sumo-origin-dist"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  {lang === 'miz' ? 'Thawn Chhuahna District' : 'From District'}
                </label>
                <select
                  id="sumo-origin-dist"
                  value={originDistrict}
                  onChange={(e) => handleOriginChange(e.target.value as MizoramDistrict)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
                >
                  {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Origin Sumo Counter"
                  value={originCounter}
                  onChange={(e) => setOriginCounter(e.target.value)}
                  className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                >
                  {originCounters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="sumo-dest-dist"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                {bookingMode === 'proxy_shopping'
                  ? lang === 'miz'
                    ? 'I Awmna / Thlenna District'
                    : 'Your Destination District'
                  : lang === 'miz'
                    ? 'Thlenna Tur District'
                    : 'To District'}
              </label>
              <select
                id="sumo-dest-dist"
                value={destinationDistrict}
                onChange={(e) => handleDestChange(e.target.value as MizoramDistrict)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.filter((d) => d !== effectiveOrigin).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                aria-label="Destination Sumo Counter"
                value={destinationCounter}
                onChange={(e) => setDestinationCounter(e.target.value)}
                className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300"
              >
                {destCounters.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sender / Receiver Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label htmlFor="sumo-sender" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {bookingMode === 'proxy_shopping'
                  ? lang === 'miz'
                    ? 'Chah-tu Hming'
                    : 'Your Name'
                  : lang === 'miz'
                    ? 'Thawntu Hming'
                    : 'Sender Name'}
              </label>
              <input
                id="sumo-sender"
                type="text"
                required
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="sumo-receiver" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {lang === 'miz' ? 'Dawngtu Hming' : 'Receiver Name'}
              </label>
              <input
                id="sumo-receiver"
                type="text"
                required
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="e.g. Pi Lalnunpuii"
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="sumo-phone" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {lang === 'miz' ? 'Dawngtu Phone' : 'Receiver Phone'}
              </label>
              <input
                id="sumo-phone"
                type="tel"
                required
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                placeholder="+91 94361 22019"
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            <div className={bookingMode === 'proxy_shopping' ? 'sm:col-span-6' : 'sm:col-span-8'}>
              <label htmlFor="sumo-desc" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {bookingMode === 'proxy_shopping'
                  ? lang === 'miz'
                    ? 'Aizawl-a Lei Tur List'
                    : 'Items to Buy in Aizawl'
                  : lang === 'miz'
                    ? 'Thil Thawn Chanchin'
                    : 'Parcel Contents'}
              </label>
              <input
                id="sumo-desc"
                type="text"
                required
                value={parcelDescription}
                onChange={(e) => setParcelDescription(e.target.value)}
                placeholder={
                  bookingMode === 'proxy_shopping'
                    ? lang === 'miz'
                      ? 'Entirnan: Millennium Centre Winter Jacket (M), Zarkawt Pharmacy damdawi'
                      : 'e.g. Bara Bazar spices, Millennium Centre boots (Size 8)'
                    : lang === 'miz'
                      ? 'Entirnan: Puan leh chhang bawm, thil keh thei lo'
                      : 'e.g. Warm clothes, documents & snacks box'
                }
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            {bookingMode === 'proxy_shopping' && (
              <div className="sm:col-span-3">
                <label htmlFor="sumo-budget" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {lang === 'miz' ? 'Thil Man Budget (₹)' : 'Item Budget (₹)'}
                </label>
                <input
                  id="sumo-budget"
                  type="number"
                  min={100}
                  max={15000}
                  step={50}
                  value={estimatedItemBudgetRs}
                  onChange={(e) => setEstimatedItemBudgetRs(Number(e.target.value) || 500)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            <div className={bookingMode === 'proxy_shopping' ? 'sm:col-span-3' : 'sm:col-span-4'}>
              <label htmlFor="sumo-weight" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {lang === 'miz' ? 'Rih Zawng (kg)' : 'Weight (kg)'} · <span className="font-mono">{weightKg} kg</span>
              </label>
              <input
                id="sumo-weight"
                type="number"
                min={0.5}
                max={50}
                step={0.5}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value) || 1)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {bookingMode === 'proxy_shopping' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {lang === 'miz'
                      ? 'Item Reference / Bill Receipt Thlalak (Optional)'
                      : 'Item Reference / Receipt Photo (Optional)'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'miz'
                      ? 'Aizawl Runner-in dawr receipt thlalak a rawn upload bawk ang'
                      : 'Aizawl Runner also uploads the shop bill receipt before Sumo handover'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCameraTarget({ mode: 'new' })}
                  className="min-h-[38px] rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{lang === 'miz' ? 'Camera' : 'Take Photo'}</span>
                </button>
                <label className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 cursor-pointer">
                  <Receipt className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>{receiptPhotoUrl ? 'Photo Attached' : 'Upload File'}</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handleNewReceiptFile} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* Transparent Fare Breakdown Strip */}
          <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHomeDrop}
                  onChange={(e) => setIncludeHomeDrop(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700"
                />
                {lang === 'miz'
                  ? `${destinationDistrict} In Thleng Runner Dah (+₹65)`
                  : `Include ${destinationDistrict} Home Runner Drop (+₹65)`}
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              {bookingMode === 'proxy_shopping' ? (
                <>
                  <span>Item Budget (Escrow): ₹{fare.estimatedItemBudgetRs}</span>
                  <span>· Proxy Shopper Fee: ₹{fare.proxyShoppingFee}</span>
                </>
              ) : (
                <span>Home Pickup: ₹{fare.homePickupFee}</span>
              )}
              <span>· Sumo Freight: ₹{fare.sumoCounterFreight}</span>
              {fare.destinationDropFee > 0 && <span>· Dest. Drop: ₹{fare.destinationDropFee}</span>}
              {fare.plusDiscount > 0 && (
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  · Plus Savings: -₹{fare.plusDiscount}
                </span>
              )}
            </div>
          </div>
        </form>

        {/* Live Inter-District Sumo Parcels & Proxy Shopping Tracker */}
        {parcels.length > 0 && (
          <section className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              {lang === 'miz' ? 'Sumo Parcel & Proxy Orders' : 'Active Sumo Bridge & Proxy Orders'}
            </h3>
            <div className="space-y-2">
              {parcels.slice(0, 5).map((p) => {
                const statusInfo = STATUS_LABELS[p.status];
                const isProxy = p.bookingMode === 'proxy_shopping';
                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-emerald-800 dark:text-emerald-400">
                          {p.trackingCode}
                        </span>
                        {isProxy && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-md">
                            Proxy Shop
                          </span>
                        )}
                        <span>·</span>
                        <span>{p.originDistrict}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.destinationDistrict}</span>
                      </div>
                      <span className="text-xs font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
                        ₹{p.allInclusiveTotal.toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {p.shoppingMarket ? `[${p.shoppingMarket}] ` : ''}
                      {p.parcelDescription} ({p.weightKg}kg) · To: {p.receiverName} ({p.receiverPhone})
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {p.originCounter} → {p.destinationCounter}
                      {p.estimatedItemBudgetRs
                        ? ` · Budget ₹${p.estimatedItemBudgetRs} + Proxy ₹${p.proxyShoppingFeeRs ?? 0}`
                        : ''}
                    </p>

                    {p.receiptPhotoUrl && (
                      <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 p-2">
                        <img
                          src={p.receiptPhotoUrl}
                          alt={`Receipt for ${p.trackingCode}`}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
                          {lang === 'miz' ? 'Shop Receipt Thlalak Verified' : 'Shop Receipt Photo Uploaded'}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {lang === 'miz' ? statusInfo.miz : statusInfo.en}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isProxy && !p.receiptPhotoUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCameraTarget({ mode: 'existing', parcelId: p.id })}
                              className="min-h-[32px] rounded-lg bg-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-white inline-flex items-center gap-1"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Camera</span>
                            </button>
                            <label className="min-h-[32px] rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 cursor-pointer inline-flex items-center gap-1">
                              <Receipt className="w-3 h-3" />
                              <span>
                                {uploadingReceiptId === p.id
                                  ? '...'
                                  : lang === 'miz'
                                    ? 'Upload File'
                                    : 'Upload Receipt'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => void handleAttachExistingReceipt(p.id, e)}
                                className="hidden"
                              />
                            </label>
                          </>
                        )}
                        {p.status !== 'delivered' && (
                          <button
                            type="button"
                            disabled={advancingId === p.id}
                            onClick={() => void handleAdvanceStatus(p.id)}
                            className="min-h-[32px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            {advancingId === p.id
                              ? '...'
                              : lang === 'miz'
                                ? 'Update Step'
                                : 'Advance Status'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <CameraCaptureModal
        open={Boolean(cameraTarget)}
        onClose={() => setCameraTarget(null)}
        lang={lang}
        category="receipt"
        district={destinationDistrict}
        orderRef={cameraTarget?.mode === 'existing' ? cameraTarget.parcelId : undefined}
        titleEn="Capture Shop Bill / Receipt Photo"
        titleMiz="Dawr Receipt / Thil Thlalak La Rawh"
        onCaptured={async (result) => {
          if (!cameraTarget) return;
          if (cameraTarget.mode === 'new') {
            setReceiptPhotoUrl(result.url);
            return;
          }
          setUploadingReceiptId(cameraTarget.parcelId);
          try {
            const res = await fetch(
              `/api/premium/sumo-parcels/${cameraTarget.parcelId}/receipt`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiptPhotoUrl: result.url }),
              }
            );
            if (res.ok) {
              triggerHaptic('success');
              await onBooked();
            }
          } finally {
            setUploadingReceiptId(null);
          }
        }}
      />
    </LayerWindow>
  );
};
