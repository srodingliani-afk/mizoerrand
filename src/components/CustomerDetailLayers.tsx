import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  MessageCircle,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import type {
  EmergencySosTicket,
  ErrandRequest,
  Language,
  MarketplaceOrder,
  StaffingBooking,
} from '../shared/types';
import { triggerHaptic } from '../lib/nativeBridge';
import { LayerWindow } from './LayerWindow';
import { GPayCheckoutModal } from './GPayCheckoutModal';

interface CustomerDetailLayersProps {
  lang: Language;
  selectedErrand: ErrandRequest | null;
  onCloseErrand: () => void;
  onSelectBid: (jobId: string, bidId: string) => Promise<void>;

  selectedOrder: MarketplaceOrder | null;
  onCloseOrder: () => void;
  onInspectOrder: (orderId: string, action: 'accept' | 'reject') => Promise<void>;
  onOpenOrderChat: (orderId: string) => void;

  selectedContract: StaffingBooking | null;
  onCloseContract: () => void;
  onTriggerWorkerSos: (bookingId: string) => Promise<void>;

  selectedSosTicket: EmergencySosTicket | null;
  onCloseSosTicket: () => void;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const CustomerDetailLayers: React.FC<CustomerDetailLayersProps> = ({
  lang,
  selectedErrand,
  onCloseErrand,
  onSelectBid,
  selectedOrder,
  onCloseOrder,
  onInspectOrder,
  onOpenOrderChat,
  selectedContract,
  onCloseContract,
  onTriggerWorkerSos,
  selectedSosTicket,
  onCloseSosTicket,
}) => {
  const [gpayModalTarget, setGpayModalTarget] = useState<{
    amountRs: number;
    orderRef: string;
    titleEn: string;
    titleMiz: string;
  } | null>(null);

  return (
    <>
      {/* =================================================================== */}
      {/* LAYER 2: ERRAND / JOB FULL DETAILS                                  */}
      {/* =================================================================== */}
      <LayerWindow
        open={Boolean(selectedErrand)}
        onClose={onCloseErrand}
        onBack={onCloseErrand}
        layerLevel={2}
        title={lang === 'miz' ? 'Order Detail Kimchang' : 'Full Errand Details'}
        subtitle={
          selectedErrand
            ? `${selectedErrand.id} · ${selectedErrand.district || 'Aizawl'} · ${formatDateTime(selectedErrand.createdAt)}`
            : undefined
        }
        size="lg"
      >
        {selectedErrand && (
          <div className="space-y-4">
            {/* Title, Status & Handover OTP */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                  {selectedErrand.status.replace(/_/g, ' ')} · {selectedErrand.jobType.replace(/_/g, ' ')}
                </p>
                <h3 className="text-base font-bold text-slate-900 leading-snug">{selectedErrand.title}</h3>
                <p className="text-xs text-slate-500">
                  {selectedErrand.customerName} · {selectedErrand.distanceKm} km
                  {selectedErrand.isInterDistrict ? ' · Inter-District' : ''}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-950 text-white px-4 py-2.5 text-center shrink-0">
                <p className="text-[10px] uppercase tracking-wider text-emerald-300">Handover OTP</p>
                <p className="text-xl font-extrabold font-mono tracking-widest tabular-nums">
                  {selectedErrand.otpCode}
                </p>
              </div>
            </div>

            {/* Full Route & Coordinates */}
            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {lang === 'miz' ? 'Kawng & Hmun (Route)' : 'Route & Coordinates'}
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-900">
                      Pickup: {selectedErrand.origin.label || 'Origin'}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {selectedErrand.origin.lat.toFixed(4)}, {selectedErrand.origin.lng.toFixed(4)}
                    </p>
                  </div>
                </div>

                {selectedErrand.stops.map((st, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800">
                        Stop {idx + 1}: {st.label || 'Intermediate Stop'}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {st.lat.toFixed(4)}, {st.lng.toFixed(4)}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="flex items-start gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-900 mt-1 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-900">
                      Drop: {selectedErrand.destination.label || 'Destination'}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {selectedErrand.destination.lat.toFixed(4)}, {selectedErrand.destination.lng.toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Specifications & Fare Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2 text-xs">
                <h4 className="font-bold uppercase tracking-wider text-slate-500">
                  {lang === 'miz' ? 'Thil Kalhmang' : 'Job Specifications'}
                </h4>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Terrain Access</span>
                  <span className="font-semibold text-slate-900">
                    {selectedErrand.accessType === 'long_steps_walk' ? 'Steps / Footpath' : 'Vehicle Road'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Runner Helper</span>
                  <span className="font-semibold text-slate-900">
                    {selectedErrand.needsWalkerHelper ? 'Yes (+₹120)' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Declared Value</span>
                  <span className="font-mono font-semibold text-slate-900">
                    ₹{selectedErrand.declaredValue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Police-Verified Req</span>
                  <span className="font-semibold text-emerald-800">
                    {selectedErrand.requiresPoliceVerifiedPartner ? 'Mandatory' : 'Standard KYC'}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2 text-xs">
                <h4 className="font-bold uppercase tracking-wider text-slate-500">
                  {lang === 'miz' ? 'Man & Escrow' : 'Payment & Escrow'}
                </h4>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Payment Mode</span>
                  <span className="font-semibold text-slate-900">
                    {selectedErrand.paymentMethod === 'upi_escrow' ? 'UPI Escrow (100%)' : 'Dynamic QR COD'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Micro-Insurance</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {selectedErrand.microInsuranceOptIn ? `₹${selectedErrand.microInsuranceFee}` : 'Opted out'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Advance Token</span>
                  <span className="font-mono font-semibold text-slate-900">
                    ₹{selectedErrand.advanceTokenAmount} ({selectedErrand.advanceTokenPaid ? 'Paid' : 'Pending'})
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-900">All-Inclusive Total</span>
                  <span className="text-base font-extrabold font-mono tabular-nums text-emerald-900">
                    ₹{selectedErrand.allInclusiveTotal}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setGpayModalTarget({
                      amountRs: selectedErrand.allInclusiveTotal,
                      orderRef: selectedErrand.id,
                      titleEn: `GPay Payment · ${selectedErrand.title}`,
                      titleMiz: `GPay Pawisa Pekna · ${selectedErrand.title}`,
                    })
                  }
                  className="w-full mt-2 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {lang === 'miz'
                    ? `GPay / QR-in Pe Rawh (₹${selectedErrand.allInclusiveTotal})`
                    : `Pay with Google Pay (GPay · ₹${selectedErrand.allInclusiveTotal})`}
                </button>
              </div>
            </div>

            {/* Landmark Note & Photos */}
            {(selectedErrand.voiceNoteTranscript ||
              selectedErrand.buildingPhotoUrl ||
              selectedErrand.beforeProofUrl ||
              selectedErrand.afterProofUrl) && (
              <div className="rounded-2xl border border-slate-200/80 p-4 space-y-3 text-xs">
                <h4 className="font-bold uppercase tracking-wider text-slate-500">
                  {lang === 'miz' ? 'Landmark Note & Thlalak' : 'Landmark Notes & Photo Proofs'}
                </h4>
                {selectedErrand.voiceNoteTranscript && (
                  <p className="rounded-xl bg-slate-50 p-3 text-slate-700 leading-relaxed">
                    “{selectedErrand.voiceNoteTranscript}”
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {selectedErrand.buildingPhotoUrl && (
                    <figure className="space-y-1">
                      <img
                        src={selectedErrand.buildingPhotoUrl}
                        alt="Building gate reference"
                        className="aspect-[4/3] w-full rounded-xl object-cover bg-slate-100"
                      />
                      <figcaption className="text-[11px] text-slate-500">Gate Reference</figcaption>
                    </figure>
                  )}
                  {selectedErrand.beforeProofUrl && (
                    <figure className="space-y-1">
                      <img
                        src={selectedErrand.beforeProofUrl}
                        alt="Pickup proof"
                        className="aspect-[4/3] w-full rounded-xl object-cover bg-slate-100"
                      />
                      <figcaption className="text-[11px] text-slate-500">Before Proof</figcaption>
                    </figure>
                  )}
                  {selectedErrand.afterProofUrl && (
                    <figure className="space-y-1">
                      <img
                        src={selectedErrand.afterProofUrl}
                        alt="Delivery proof"
                        className="aspect-[4/3] w-full rounded-xl object-cover bg-slate-100"
                      />
                      <figcaption className="text-[11px] text-slate-500">After Proof</figcaption>
                    </figure>
                  )}
                </div>
              </div>
            )}

            {/* Detailed Partner Bids */}
            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {lang === 'miz' ? 'Partner Offer Kimchang' : 'Partner Offers'} ({selectedErrand.bids.length})
              </h4>
              {selectedErrand.bids.length === 0 ? (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {lang === 'miz' ? 'Partner bid nghah mek a ni...' : 'Waiting for verified partner bids...'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {selectedErrand.bids.map((bid) => (
                    <div key={bid.id} className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{bid.partnerName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ★ {bid.partnerRating} · {bid.partnerCategory.replace('_', ' ')} · ETA {bid.etaMinutes}m
                          {bid.corridorMatchMeters !== null ? ` · ${bid.corridorMatchMeters}m corridor` : ''}
                        </p>
                        {bid.partnerBadges.length > 0 && (
                          <p className="text-[11px] font-medium text-emerald-800 mt-0.5">
                            {bid.partnerBadges.join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                          ₹{bid.bidAmount}
                        </span>
                        {selectedErrand.status === 'bidding' ? (
                          <button
                            type="button"
                            onClick={() => void onSelectBid(selectedErrand.id, bid.id)}
                            className="min-h-[40px] rounded-xl bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900"
                          >
                            {lang === 'miz' ? 'Thlang' : 'Accept'}
                          </button>
                        ) : (
                          selectedErrand.selectedBidId === bid.id && (
                            <span className="text-xs font-bold text-emerald-700">Selected</span>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </LayerWindow>

      {/* =================================================================== */}
      {/* LAYER 2: MARKETPLACE ORDER FULL DETAILS                             */}
      {/* =================================================================== */}
      <LayerWindow
        open={Boolean(selectedOrder)}
        onClose={onCloseOrder}
        onBack={onCloseOrder}
        layerLevel={2}
        title={lang === 'miz' ? 'Bazar Order Detail Kimchang' : 'Full Order & Escrow Details'}
        subtitle={
          selectedOrder
            ? `${selectedOrder.id} · ${selectedOrder.shopName} · ${formatDateTime(selectedOrder.createdAt)}`
            : undefined
        }
        size="md"
        footer={
          selectedOrder && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  const id = selectedOrder.id;
                  onCloseOrder();
                  onOpenOrderChat(id);
                }}
                className="min-h-[44px] rounded-2xl bg-slate-100 hover:bg-slate-200 px-4 py-2 text-xs font-bold text-slate-900 inline-flex items-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4 text-emerald-700" />
                {lang === 'miz' ? 'Dawr Biakna' : 'Shop Chat'} ({selectedOrder.chatMessages.length})
              </button>
              {selectedOrder.status === 'awaiting_inspection' && (
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <button
                    type="button"
                    onClick={() => void onInspectOrder(selectedOrder.id, 'reject')}
                    className="min-h-[44px] rounded-2xl bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700"
                  >
                    Return (₹{selectedOrder.returnFeeOnReject})
                  </button>
                  <button
                    type="button"
                    onClick={() => void onInspectOrder(selectedOrder.id, 'accept')}
                    className="min-h-[44px] rounded-2xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white"
                  >
                    Accept &amp; Pay ₹{selectedOrder.allInclusiveTotal}
                  </button>
                </div>
              )}
            </div>
          )
        }
      >
        {selectedOrder && (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-1">
              <p className="font-semibold uppercase tracking-wider text-emerald-800 text-[11px]">
                {selectedOrder.status.replace(/_/g, ' ')}
              </p>
              <h3 className="text-base font-bold text-slate-900">{selectedOrder.productTitle}</h3>
              <p className="text-slate-600">
                {selectedOrder.shopName} · {selectedOrder.veng} ({selectedOrder.district || 'Aizawl'})
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-slate-500">
                {lang === 'miz' ? 'Pawisa & Escrow Chhiarkawp' : 'Escrow Itemized Breakdown'}
              </h4>
              <div className="flex justify-between">
                <span className="text-slate-500">Item Price</span>
                <span className="font-mono font-semibold text-slate-900">₹{selectedOrder.price}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hyperlocal Delivery Fee</span>
                <span className="font-mono font-semibold text-slate-900">₹{selectedOrder.deliveryFee}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Micro-Insurance Sachet</span>
                <span className="font-mono font-semibold text-slate-900">₹{selectedOrder.microInsuranceFee}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-900">All-Inclusive Escrow Total</span>
                <span className="text-base font-extrabold font-mono tabular-nums text-emerald-900">
                  ₹{selectedOrder.allInclusiveTotal}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setGpayModalTarget({
                    amountRs: selectedOrder.allInclusiveTotal,
                    orderRef: selectedOrder.id,
                    titleEn: `GPay Payment · ${selectedOrder.productTitle}`,
                    titleMiz: `GPay Pawisa Pekna · ${selectedOrder.productTitle}`,
                  })
                }
                className="w-full mt-2 min-h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                {lang === 'miz'
                  ? `GPay / QR-in Pe Rawh (₹${selectedOrder.allInclusiveTotal})`
                  : `Pay with Google Pay (GPay · ₹${selectedOrder.allInclusiveTotal})`}
              </button>
            </div>

            <div className="rounded-2xl bg-emerald-50/70 p-4 space-y-1.5 text-emerald-950">
              <p className="font-bold">
                {selectedOrder.checkBeforePay
                  ? 'En Hmasak Phawt (Gate Inspection Enabled)'
                  : 'Sealed Hygiene Delivery'}
              </p>
              <p className="text-emerald-900/85">
                Hygiene Category: {selectedOrder.hygieneCategory.replace(/_/g, ' ')} · Return fee if rejected: ₹
                {selectedOrder.returnFeeOnReject}
              </p>
            </div>
          </div>
        )}
      </LayerWindow>

      {/* =================================================================== */}
      {/* LAYER 2: ACTIVE STAFFING CONTRACT FULL DETAILS                      */}
      {/* =================================================================== */}
      <LayerWindow
        open={Boolean(selectedContract)}
        onClose={onCloseContract}
        onBack={onCloseContract}
        layerLevel={2}
        title={lang === 'miz' ? 'Contract Detail Kimchang' : 'Digital Contract Details'}
        subtitle={
          selectedContract
            ? `${selectedContract.contractId} · ${formatDateTime(selectedContract.createdAt)}`
            : undefined
        }
        size="md"
        footer={
          selectedContract && (
            <button
              type="button"
              onClick={() => void onTriggerWorkerSos(selectedContract.id)}
              className={`w-full min-h-[48px] rounded-2xl px-4 py-3 text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors ${
                selectedContract.workerSosActive
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              {selectedContract.workerSosActive
                ? 'Worker SOS Alert Active — Command Center Notified'
                : 'Trigger Worker Safety SOS'}
            </button>
          )
        }
      >
        {selectedContract && (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-emerald-800">{selectedContract.contractId}</span>
                <span className="font-semibold capitalize text-slate-700">{selectedContract.status}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">{selectedContract.workerName}</h3>
              <p className="text-slate-600">
                Client: {selectedContract.customerName} ·{' '}
                {selectedContract.mode === 'company_managed_staffing'
                  ? 'Company-Managed Awmpui'
                  : 'On-Demand Workforce'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-slate-500">Contract Terms</h4>
              <div className="flex justify-between">
                <span className="text-slate-500">Agreement Type</span>
                <span className="font-semibold text-slate-900">
                  {selectedContract.tripartiteAgreement
                    ? 'Tripartite Managed Payroll'
                    : 'Direct Verified Contract'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Outstation / Live-In</span>
                <span className="font-semibold text-slate-900">
                  {selectedContract.isOutstationOrLiveIn ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-900">All-Inclusive Package</span>
                <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                  ₹{selectedContract.allInclusiveAmount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-slate-500">
                {lang === 'miz' ? 'Worker Welfare Safeguards' : 'Verified Welfare Safeguards'}
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div
                  className={`rounded-xl p-2.5 border ${
                    selectedContract.accommodationProvided
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <p className="font-bold">Safe Room</p>
                  <p className="text-[11px] mt-0.5">{selectedContract.accommodationProvided ? 'Verified' : 'N/A'}</p>
                </div>
                <div
                  className={`rounded-xl p-2.5 border ${
                    selectedContract.foodProvided
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <p className="font-bold">Daily Meals</p>
                  <p className="text-[11px] mt-0.5">{selectedContract.foodProvided ? 'Verified' : 'N/A'}</p>
                </div>
                <div
                  className={`rounded-xl p-2.5 border ${
                    selectedContract.travelCovered
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <p className="font-bold">Travel</p>
                  <p className="text-[11px] mt-0.5">{selectedContract.travelCovered ? 'Covered' : 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </LayerWindow>

      {/* =================================================================== */}
      {/* LAYER 2: EMERGENCY SOS TICKET FULL DETAILS                          */}
      {/* =================================================================== */}
      <LayerWindow
        open={Boolean(selectedSosTicket)}
        onClose={onCloseSosTicket}
        onBack={onCloseSosTicket}
        layerLevel={2}
        accent="danger"
        title={lang === 'miz' ? 'SOS Dispatch Detail Kimchang' : 'Full SOS Dispatch Details'}
        subtitle={
          selectedSosTicket
            ? `${selectedSosTicket.id} · ${selectedSosTicket.district || 'Aizawl'} · ${formatDateTime(selectedSosTicket.createdAt)}`
            : undefined
        }
        size="md"
      >
        {selectedSosTicket && (
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl bg-red-50 border border-red-200/80 p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-red-700 uppercase">
                  {selectedSosTicket.category.replace(/_/g, ' ')}
                </span>
                <span className="font-bold capitalize text-red-900">
                  {selectedSosTicket.status.replace(/_/g, ' ')}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900">{selectedSosTicket.assignedTechName}</h3>
              <p className="text-slate-700">
                Shift: {selectedSosTicket.assignedTechShift} · SLA {selectedSosTicket.slaTargetMinutes} mins (Dispatched in{' '}
                {selectedSosTicket.dispatchSlaSeconds}s)
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-600" />
                Location &amp; Transcript
              </h4>
              <p className="font-semibold text-slate-900">
                {selectedSosTicket.veng}, {selectedSosTicket.district || 'Aizawl'}
              </p>
              <p className="font-mono text-[11px] text-slate-500">
                GPS: {selectedSosTicket.lat.toFixed(5)}, {selectedSosTicket.lng.toFixed(5)}
              </p>
              <p className="rounded-xl bg-slate-50 p-3 text-slate-700 leading-relaxed">
                “{selectedSosTicket.voiceNoteTranscript}”
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                Transparent Standardized Cost
              </h4>
              <div className="flex justify-between">
                <span className="text-slate-500">Standardized Service Rate</span>
                <span className="font-mono font-semibold text-slate-900">
                  ₹{selectedSosTicket.standardizedRate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verified Spare Parts</span>
                <span className="font-mono font-semibold text-slate-900">
                  ₹{selectedSosTicket.sparePartsAmount}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-900">Total Payable</span>
                <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                  ₹{selectedSosTicket.standardizedRate + selectedSosTicket.sparePartsAmount}
                </span>
              </div>
              <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Salaried Shift Tech
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" /> Customer: {selectedSosTicket.customerName}
                </span>
              </div>
            </div>

            {selectedSosTicket.sparePartReceiptUrl && (
              <div className="rounded-2xl border border-slate-200/80 p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Spare Part Receipt</p>
                <img
                  src={selectedSosTicket.sparePartReceiptUrl}
                  alt="Spare part receipt"
                  className="w-full max-h-56 object-contain rounded-xl bg-slate-50"
                />
              </div>
            )}
          </div>
        )}
      </LayerWindow>

      <GPayCheckoutModal
        open={Boolean(gpayModalTarget)}
        onClose={() => setGpayModalTarget(null)}
        lang={lang}
        amountRs={gpayModalTarget?.amountRs || 100}
        orderRef={gpayModalTarget?.orderRef || 'GPAY'}
        titleEn={gpayModalTarget?.titleEn || 'GPay Payment'}
        titleMiz={gpayModalTarget?.titleMiz || 'GPay Pawisa Pekna'}
      />
    </>
  );
};
