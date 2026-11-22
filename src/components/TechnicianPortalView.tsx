import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Crosshair,
  MapPin,
  Navigation,
  Wrench,
} from 'lucide-react';
import type { EmergencySosTicket, Language, MizoramDistrict, PartnerProfile } from '../shared/types';
import { calculateDistanceMeters } from '../data/mizoramDistricts';
import { startLiveGpsWatch, type LiveGpsFix, type LiveLocationWatcher } from '../lib/geolocation';
import { triggerHaptic } from '../lib/nativeBridge';
import { CameraCaptureModal } from './CameraCaptureModal';

interface TechnicianPortalViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  sosTickets: EmergencySosTicket[];
  partners?: PartnerProfile[];
  onRefresh: () => Promise<void>;
}

const DEFAULT_SHIFT_UNITS = [
  { id: 'morning', shift: 'Morning (06-14)', techName: 'Rohlupuia Fanai', zone: 'Zarkawt / Central' },
  { id: 'evening', shift: 'Evening (14-22)', techName: 'Lalmalsawma Renthlei', zone: 'Chanmari / Bawngkawn' },
  { id: 'night', shift: 'Night (22-06)', techName: 'Zonunmawia Squad', zone: 'Kulikawn / Urgent Medical' },
] as const;

export const TechnicianPortalView: React.FC<TechnicianPortalViewProps> = ({
  lang,
  selectedDistrict,
  sosTickets,
  partners = [],
  onRefresh,
}) => {
  const shiftUnits = useMemo(() => {
    const dynamicTechs = partners
      .filter((p) => p.isSalariedTechnician)
      .map((p) => ({
        id: p.id,
        shift: p.shift || 'Morning (06-14)',
        techName: p.name,
        zone: `${p.veng} (${p.district || 'Aizawl'})`,
      }));
    const merged: Array<{ id: string; shift: string; techName: string; zone: string }> = [
      ...DEFAULT_SHIFT_UNITS,
    ];
    for (const dt of dynamicTechs) {
      if (!merged.some((m) => m.techName.toLowerCase() === dt.techName.toLowerCase())) {
        merged.push(dt);
      }
    }
    return merged;
  }, [partners]);

  const [unitId, setUnitId] = useState<string>(DEFAULT_SHIFT_UNITS[0].id);
  const [filter, setFilter] = useState<'active' | 'resolved' | 'all'>('active');
  const [partsDraft, setPartsDraft] = useState<Record<string, string>>({});
  const [receiptDraft, setReceiptDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [receiptCameraTicketId, setReceiptCameraTicketId] = useState<string | null>(null);
  const [liveTechGps, setLiveTechGps] = useState<LiveGpsFix | null>(null);
  const gpsWatcherRef = useRef<LiveLocationWatcher | null>(null);

  const activeUnit = shiftUnits.find((u) => u.id === unitId) || shiftUnits[0];

  useEffect(() => {
    gpsWatcherRef.current?.stop();
    gpsWatcherRef.current = startLiveGpsWatch(
      (fix) => {
        setLiveTechGps(fix);
      },
      () => {},
      { maxAutoRefineMs: 600000 }
    );
    return () => {
      gpsWatcherRef.current?.stop();
    };
  }, []);

  const visibleTickets = useMemo(() => {
    return sosTickets.filter((t) => {
      if (filter === 'active') return t.status !== 'resolved';
      if (filter === 'resolved') return t.status === 'resolved';
      return true;
    });
  }, [sosTickets, filter]);

  const handleUpdateTicket = async (ticket: EmergencySosTicket, nextStatus: 'en_route' | 'resolved') => {
    setBusyId(ticket.id);
    setStatusMsg(null);
    triggerHaptic(nextStatus === 'en_route' ? 'sos' : 'success');
    try {
      const sparePartsAmount = Number(partsDraft[ticket.id] ?? ticket.sparePartsAmount) || 0;
      const sparePartReceiptUrl = (receiptDraft[ticket.id] || '').trim() || undefined;
      const res = await fetch(`/api/emergency/tickets/${ticket.id}/tech-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          sparePartsAmount,
          sparePartReceiptUrl,
          techName: activeUnit.techName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMsg(data.error || 'Could not update SOS ticket.');
        return;
      }
      setStatusMsg(
        nextStatus === 'en_route'
          ? `${ticket.id} accepted by ${activeUnit.techName} — En Route to ${ticket.veng}.`
          : `${ticket.id} marked Resolved (Total ₹${ticket.standardizedRate + sparePartsAmount}).`
      );
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const flashingCount = sosTickets.filter((t) => t.status === 'flashing_dispatch').length;
  const enRouteCount = sosTickets.filter((t) => t.status === 'en_route').length;

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Rapid Response Header */}
      <section className="rounded-3xl bg-slate-950 text-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shrink-0">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-red-400">
                {lang === 'miz' ? '24×7 Emergency Technician Portal' : '24×7 Rapid SOS Responder Console'}
              </p>
              <h1 className="text-lg sm:text-xl font-bold">{activeUnit.techName}</h1>
              <p className="text-xs text-slate-300">
                {activeUnit.shift} · {activeUnit.zone} · {selectedDistrict}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="tech-shift-unit" className="sr-only">
              Select 24x7 shift unit
            </label>
            <select
              id="tech-shift-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="min-h-[42px] rounded-xl bg-white/10 border border-white/20 px-3 text-xs font-semibold text-white"
            >
              {shiftUnits.map((u) => (
                <option key={u.id} value={u.id} className="text-slate-900">
                  {u.shift} · {u.techName} ({u.zone})
                </option>
              ))}
            </select>
            {liveTechGps && (
              <p className="text-[11px] font-mono text-emerald-300 mt-1.5 flex items-center justify-end gap-1">
                <Crosshair className="w-3 h-3" />
                Auto-GPS: {liveTechGps.lat.toFixed(4)}, {liveTechGps.lng.toFixed(4)} (±{liveTechGps.accuracyMeters}m)
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/15 text-xs">
          <div>
            <p className="text-slate-400">Flashing New</p>
            <p className="font-mono tabular-nums font-extrabold text-lg text-red-400 mt-0.5">
              {flashingCount}
            </p>
          </div>
          <div>
            <p className="text-slate-400">En Route</p>
            <p className="font-mono tabular-nums font-extrabold text-lg text-amber-400 mt-0.5">
              {enRouteCount}
            </p>
          </div>
          <div>
            <p className="text-slate-400">Total Tickets</p>
            <p className="font-mono tabular-nums font-extrabold text-lg text-emerald-400 mt-0.5">
              {sosTickets.length}
            </p>
          </div>
        </div>
      </section>

      {/* Queue Filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-white p-1 border border-slate-200">
          {(
            [
              ['active', lang === 'miz' ? 'Kal Mek' : 'Active Queue'],
              ['resolved', lang === 'miz' ? 'Chingfel Tawh' : 'Resolved'],
              ['all', lang === 'miz' ? 'A Vaiin' : 'All'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`min-h-[38px] rounded-lg px-3.5 text-xs font-bold ${
                filter === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <p role="status" className="rounded-2xl bg-emerald-900 text-white px-4 py-3 text-xs font-semibold">
          {statusMsg}
        </p>
      )}

      {/* SOS Tickets List */}
      <div className="space-y-3.5">
        {visibleTickets.map((ticket) => (
          <div
            key={ticket.id}
            className={`rounded-3xl bg-white p-5 border space-y-3.5 ${
              ticket.status === 'flashing_dispatch'
                ? 'border-red-500 shadow-[0_6px_22px_rgba(220,38,38,0.12)]'
                : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  {ticket.id} · {ticket.district || 'Aizawl'} ·{' '}
                  <span
                    className={
                      ticket.status === 'flashing_dispatch'
                        ? 'font-bold text-red-600'
                        : ticket.status === 'en_route'
                          ? 'font-bold text-amber-700'
                          : 'font-bold text-emerald-700'
                    }
                  >
                    {ticket.status.replace('_', ' ').toUpperCase()}
                  </span>
                </p>
                <h2 className="text-base font-bold text-slate-900 mt-0.5 capitalize">
                  {ticket.category.replace(/_/g, ' ')} — {ticket.customerName}
                </h2>
                <p className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                    {ticket.veng} ({ticket.lat.toFixed(4)}, {ticket.lng.toFixed(4)})
                    {liveTechGps
                      ? ` · ${(calculateDistanceMeters(liveTechGps, { lat: ticket.lat, lng: ticket.lng }) / 1000).toFixed(2)} km away`
                      : ''}
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    SLA {ticket.slaTargetMinutes}m
                  </span>
                </p>
                <p className="text-xs text-slate-700 bg-slate-50 rounded-xl px-3 py-2 mt-2">
                  “{ticket.voiceNoteTranscript}”
                </p>
              </div>

              <div className="text-right font-mono tabular-nums">
                <p className="text-xs text-slate-500">Fixed Rate</p>
                <p className="text-lg font-extrabold text-slate-900">₹{ticket.standardizedRate}</p>
                {ticket.sparePartsAmount > 0 && (
                  <p className="text-xs text-slate-600">+ ₹{ticket.sparePartsAmount} parts</p>
                )}
              </div>
            </div>

            {ticket.status !== 'resolved' && (
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-2.5">
                  <div>
                    <label
                      htmlFor={`parts-${ticket.id}`}
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Spare Parts (₹)
                    </label>
                    <input
                      id={`parts-${ticket.id}`}
                      type="number"
                      min={0}
                      max={50000}
                      value={partsDraft[ticket.id] ?? String(ticket.sparePartsAmount || 0)}
                      onChange={(e) =>
                        setPartsDraft((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                      }
                      className="w-28 min-h-[40px] rounded-xl border border-slate-300 px-2.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`rcpt-${ticket.id}`}
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Receipt Ref / Camera Photo
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`rcpt-${ticket.id}`}
                        value={receiptDraft[ticket.id] ?? ticket.sparePartReceiptUrl ?? ''}
                        onChange={(e) =>
                          setReceiptDraft((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                        }
                        placeholder="BILL-AZL-204"
                        className="w-36 min-h-[40px] rounded-xl border border-slate-300 px-2.5 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setReceiptCameraTicketId(ticket.id)}
                        className="min-h-[40px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-2.5 text-xs font-bold text-slate-800 inline-flex items-center gap-1"
                      >
                        <Camera className="w-3.5 h-3.5 text-red-600" />
                        <span>Bill Camera</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {ticket.status === 'flashing_dispatch' && (
                    <button
                      type="button"
                      disabled={busyId === ticket.id}
                      onClick={() => void handleUpdateTicket(ticket, 'en_route')}
                      className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-700"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Accept &amp; En Route
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === ticket.id}
                    onClick={() => void handleUpdateTicket(ticket, 'resolved')}
                    className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Resolved
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {visibleTickets.length === 0 && (
          <div className="rounded-3xl bg-white border border-slate-200 p-8 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              {lang === 'miz' ? 'Emergency ticket awm rih lo.' : 'No SOS tickets in this view.'}
            </p>
          </div>
        )}
      </div>

      <CameraCaptureModal
        open={Boolean(receiptCameraTicketId)}
        onClose={() => setReceiptCameraTicketId(null)}
        lang={lang}
        category="receipt"
        district={selectedDistrict}
        orderRef={receiptCameraTicketId || undefined}
        titleEn="Capture Spare Part Receipt Bill"
        titleMiz="Spare Part Receipt Thla La Rawh"
        onCaptured={(result) => {
          if (receiptCameraTicketId) {
            setReceiptDraft((prev) => ({
              ...prev,
              [receiptCameraTicketId]: result.objectPath || result.url,
            }));
          }
        }}
      />
    </div>
  );
};
