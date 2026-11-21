import React, { useEffect, useState } from 'react';
import { Camera, Send, Sparkles } from 'lucide-react';
import type { Language, MarketplaceOrder, MarketplaceProduct, MizoramDistrict } from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import { ALL_MIZORAM_DISTRICT_NAMES, getVengsForDistrict } from '../data/mizoramDistricts';
import { compressImageToWebP } from '../lib/offlineCache';

interface MerchantViewProps {
  lang: Language;
  selectedDistrict: MizoramDistrict;
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  onRefresh: () => Promise<void>;
}

export const MerchantView: React.FC<MerchantViewProps> = ({
  lang,
  selectedDistrict,
  products,
  orders,
  onRefresh,
}) => {
  const t = TRANSLATIONS[lang];
  const [shopName, setShopName] = useState('Zoram Loom & Bamboo');
  const [merchantDistrict, setMerchantDistrict] = useState<MizoramDistrict>(selectedDistrict);
  const districtVengs = getVengsForDistrict(merchantDistrict);
  const [veng, setVeng] = useState(districtVengs[0]?.name || 'Dawrpui');

  useEffect(() => {
    setMerchantDistrict(selectedDistrict);
    const nextVengs = getVengsForDistrict(selectedDistrict);
    if (nextVengs[0]) setVeng(nextVengs[0].name);
  }, [selectedDistrict]);
  const [voiceOrTextPrompt, setVoiceOrTextPrompt] = useState(
    'Handwoven crimson bamboo tea tray, size medium, Rs. 850, clean studio listing.'
  );
  const [imageBase64, setImageBase64] = useState<string>('');
  const [imageMimeType, setImageMimeType] = useState<string>('image/webp');
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiResult, setAiResult] = useState<{ note?: string; error?: string } | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webp = await compressImageToWebP(file, 960);
      setImageBase64(webp);
      setImageMimeType('image/webp');
    } catch {
      setAiResult({ error: 'Could not process product photo.' });
    }
  };

  const handleMagicListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAi(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/marketplace/ai-magic-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName,
          district: merchantDistrict,
          veng,
          voiceOrTextPrompt,
          imageBase64: imageBase64 || undefined,
          imageMimeType: imageBase64 ? imageMimeType : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiResult({ error: data.error || 'AI Magic Listing failed' });
      } else {
        setAiResult({
          note: `Published "${data.product.titleEn}" / "${data.product.titleMiz}" (Rs. ${data.product.price}). Studio cleanup: ${data.studioBackdropNote}`,
        });
        await onRefresh();
      }
    } catch {
      setAiResult({ error: 'Network error calling AI Magic Listing' });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleMerchantReply = async (orderId: string) => {
    const text = replyDrafts[orderId]?.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'merchant', text }),
      });
      if (res.ok) {
        setReplyDrafts((p) => ({ ...p, [orderId]: '' }));
        await onRefresh();
      } else {
        setAiResult({ error: 'Could not send merchant message.' });
      }
    } catch {
      setAiResult({ error: 'Network error sending merchant message.' });
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* AI Magic Listing Generator */}
        <form
          onSubmit={handleMagicListing}
          className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-700" />
            <h1 className="text-lg font-bold text-slate-900">{t.merchantTitle}</h1>
          </div>
          <p className="text-xs text-slate-600">
            Snap a photo or speak/type a quick description. Gemini 4 Hydrogen Vision extracts Mizo + English bilingual titles, category, color, size, price, tags, and studio cleanup metadata.
          </p>

          <div>
            <label htmlFor="m-shop" className="block text-xs font-medium text-slate-700 mb-1">
              Shop Name
            </label>
            <input
              id="m-shop"
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="m-district" className="block text-xs font-medium text-slate-700 mb-1">
                {t.districtLabel}
              </label>
              <select
                id="m-district"
                value={merchantDistrict}
                onChange={(e) => {
                  const next = e.target.value as MizoramDistrict;
                  setMerchantDistrict(next);
                  const nextVengs = getVengsForDistrict(next);
                  if (nextVengs[0]) setVeng(nextVengs[0].name);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="m-veng" className="block text-xs font-medium text-slate-700 mb-1">
                Veng / Zone ({districtVengs.length})
              </label>
              <select
                id="m-veng"
                value={veng}
                onChange={(e) => setVeng(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {districtVengs.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
            <Camera className="w-4 h-4 text-teal-700" />
            {imageBase64 ? 'Product Photo Ready (WebP)' : 'Upload Product Photo (Optional)'}
            <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
          </label>

          <div>
            <label htmlFor="m-voice" className="block text-xs font-medium text-slate-700 mb-1">
              Voice Note Transcript / Item Details
            </label>
            <textarea
              id="m-voice"
              rows={3}
              value={voiceOrTextPrompt}
              onChange={(e) => setVoiceOrTextPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loadingAi}
            className="w-full min-h-[44px] rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {loadingAi ? 'Generating Bilingual Studio Listing...' : 'Generate AI Magic Listing'}
          </button>

          {aiResult?.note && (
            <p role="status" className="rounded-lg bg-teal-50 p-3 text-xs text-teal-900">
              {aiResult.note}
            </p>
          )}
          {aiResult?.error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-800">
              {aiResult.error}
            </p>
          )}
        </form>

        {/* Catalog & Customer Chats */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Active Shop Catalog ({products.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <img
                      src={p.imageUrl}
                      alt={p.titleEn}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-lg object-cover bg-slate-100 shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.titleEn}</p>
                      <p className="text-xs text-slate-500">
                        {p.titleMiz} · {p.veng} ({p.district || 'Aizawl'}) · {p.checkBeforePayEligible ? 'Check-Before-Pay' : `Hygiene Locked (${p.hygieneCategory})`}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold font-mono text-slate-900 shrink-0">
                    Rs. {p.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Customer-to-Merchant In-App Messages ({orders.length})
            </h2>
            {orders.length === 0 ? (
              <p className="text-xs text-slate-500">No active customer orders yet.</p>
            ) : (
              orders.map((ord) => (
                <div key={ord.id} className="rounded-xl bg-slate-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-900">
                    {ord.id} · {ord.productTitle} · {ord.status.replace(/_/g, ' ')}
                  </p>
                  <div className="space-y-1">
                    {ord.chatMessages.map((m, idx) => (
                      <p key={idx} className="text-xs text-slate-700">
                        <strong className="capitalize">{m.sender}:</strong> {m.text}
                      </p>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyDrafts[ord.id] || ''}
                      onChange={(e) => setReplyDrafts((p) => ({ ...p, [ord.id]: e.target.value }))}
                      placeholder="Reply to customer..."
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleMerchantReply(ord.id)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> Reply
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
