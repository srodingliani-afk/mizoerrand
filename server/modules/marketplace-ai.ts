import { Router } from 'express';
import { Type } from '@google/genai';
import { db } from '../infrastructure/store';
import { getGeminiClient } from '../infrastructure/geminiClient';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { isTrustedMediaUrl } from '../infrastructure/driveStorage';
import {
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
  recordDoubleEntryJournal,
} from '../infrastructure/ledgerService';
import { calculateEscrowSplit, validateCheckBeforePayReturn } from '../domain/rules';
import type {
  HygieneCategory,
  MarketplaceOrder,
  MarketplaceProduct,
  MizoramDistrict,
} from '../../src/shared/types';

export const marketplaceAiRouter = Router();

marketplaceAiRouter.get('/products', (_req, res) => {
  const state = db.get();
  res.json({
    products: state.products,
    orders: state.marketplaceOrders,
    userMonthlyReturns: state.userMonthlyReturns,
  });
});

marketplaceAiRouter.post('/orders', (req, res) => {
  const state = db.get();
  if (state.remoteConfig.sundayEmergencyMode) {
    res.status(403).json({
      error: 'Sunday Emergency Mode is active: non-emergency retail marketplace is paused today.',
    });
    return;
  }

  const {
    customerId = 'cust-1',
    productId,
    microInsuranceOptIn = true,
    voiceNoteUrl,
    voiceNoteDurationSec,
    voiceNoteTranscript,
  } = req.body as {
    customerId?: string;
    productId: string;
    microInsuranceOptIn?: boolean;
    voiceNoteUrl?: string;
    voiceNoteDurationSec?: number;
    voiceNoteTranscript?: string;
  };

  const product = state.products.find((p) => p.id === productId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const cleanVoiceUrl = isTrustedMediaUrl(voiceNoteUrl, 'audio');
  const cleanDuration =
    typeof voiceNoteDurationSec === 'number' && Number.isFinite(voiceNoteDurationSec)
      ? Math.max(1, Math.min(15, Math.round(voiceNoteDurationSec)))
      : undefined;
  const cleanTranscript =
    typeof voiceNoteTranscript === 'string' && voiceNoteTranscript.trim()
      ? voiceNoteTranscript.trim().slice(0, 200)
      : undefined;

  const deliveryFee = 55;
  const microInsuranceFee = microInsuranceOptIn ? state.remoteConfig.microInsuranceSachetRs : 0;
  const allInclusiveTotal = product.price + deliveryFee + microInsuranceFee;

  const chatMessages: MarketplaceOrder['chatMessages'] = [
    {
      sender: 'merchant',
      text: `Chibai! Your order from ${product.shopName} (${product.veng}) is packed.`,
      at: new Date().toISOString(),
    },
  ];
  if (cleanVoiceUrl || cleanTranscript) {
    chatMessages.push({
      sender: 'customer',
      text: cleanTranscript
        ? `Voice instruction (${cleanDuration ?? 5}s): "${cleanTranscript}"`
        : `Attached ${cleanDuration ?? 5}s Mizo voice note instruction for merchant.`,
      at: new Date().toISOString(),
    });
  }

  const order: MarketplaceOrder = {
    id: `MKT-${Date.now().toString().slice(-5)}`,
    customerId,
    productId: product.id,
    productTitle: product.titleEn,
    shopName: product.shopName,
    district: product.district || 'Aizawl',
    veng: product.veng,
    price: product.price,
    deliveryFee,
    microInsuranceFee,
    allInclusiveTotal,
    checkBeforePay: product.checkBeforePayEligible,
    hygieneCategory: product.hygieneCategory,
    returnFeeOnReject: state.remoteConfig.returnDeliveryFee,
    status: 'awaiting_inspection',
    voiceNoteUrl: cleanVoiceUrl,
    voiceNoteDurationSec: cleanDuration,
    voiceNoteTranscript: cleanTranscript,
    chatMessages,
    createdAt: new Date().toISOString(),
  };

  state.marketplaceOrders.unshift(order);
  db.addAudit('marketplace', 'ORDER_PLACED', `${order.id} - ${product.titleEn}`);
  realtimeHub.broadcast('marketplace_update', { order });
  res.status(201).json({ order });
});

marketplaceAiRouter.post('/orders/:id/inspect', (req, res) => {
  const { action } = req.body as { action: 'accept' | 'reject' };
  const state = db.get();
  const order = state.marketplaceOrders.find((o) => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const currentReturns = state.userMonthlyReturns[order.customerId] ?? 0;
  const check = validateCheckBeforePayReturn({
    hygieneCategory: order.hygieneCategory,
    userReturnsThisMonth: currentReturns,
    monthlyReturnLimit: state.remoteConfig.monthlyReturnLimit,
    returnDeliveryFee: state.remoteConfig.returnDeliveryFee,
    action,
  });

  if (!check.allowed) {
    res.status(400).json({ error: check.reason, canOpenBox: check.canOpenBox });
    return;
  }

  if (action === 'accept') {
    order.status = 'accepted_paid';
    const split = calculateEscrowSplit({
      grossAllInclusive: order.allInclusiveTotal,
      productAmount: order.price,
      microInsuranceSachet: order.microInsuranceFee,
      declaredValue: order.price,
    });
    const entry = {
      id: `esc-${Date.now().toString().slice(-5)}`,
      orderRef: order.id,
      grossAllInclusive: split.grossAllInclusive,
      gstAmount: split.gstAmount,
      platformCommission: split.platformCommission,
      microInsuranceSachet: split.microInsuranceSachet,
      partnerPayout: split.partnerPayout,
      merchantSettlement: split.merchantSettlement,
      paymentMode: 'upi_escrow' as const,
      escrowStatus: 'split_settled' as const,
      createdAt: new Date().toISOString(),
    };
    state.escrowLedger.unshift(entry);
    postEscrowHoldJournal(state, {
      orderRef: order.id,
      customerId: order.customerId,
      grossAllInclusive: order.allInclusiveTotal,
      paymentMode: 'upi_escrow',
    });
    postEscrowSettlementJournal(state, {
      entry,
      merchantId: order.shopName,
    });
  } else {
    order.status = 'rejected_return_fee_charged';
    state.userMonthlyReturns[order.customerId] = currentReturns + 1;
    const gstAmount = Math.round((check.returnFeeCharged * 18) / 118);
    const partnerPayout = check.returnFeeCharged - 5 - gstAmount;
    state.escrowLedger.unshift({
      id: `esc-${Date.now().toString().slice(-5)}`,
      orderRef: `${order.id}-RET`,
      grossAllInclusive: check.returnFeeCharged,
      gstAmount,
      platformCommission: 5,
      microInsuranceSachet: 0,
      partnerPayout,
      merchantSettlement: 0,
      paymentMode: 'upi_escrow',
      escrowStatus: 'split_settled',
      createdAt: new Date().toISOString(),
    });
    recordDoubleEntryJournal(state, {
      eventType: 'return_fee',
      orderRef: `${order.id}-RET`,
      description: `Check-Before-Pay return fee settled for ${order.id}`,
      postings: [
        { account: 'ASSET:UPI_CLEARING', side: 'debit', amountRs: check.returnFeeCharged },
        { account: 'LIABILITY:GST_18_OUTPUT', side: 'credit', amountRs: gstAmount },
        { account: 'REVENUE:PLATFORM_COMMISSION', side: 'credit', amountRs: 5 },
        { account: 'PAYABLE:PARTNER:fleet', side: 'credit', amountRs: partnerPayout },
      ],
    });
  }

  db.addAudit('check-before-pay', `INSPECT_${action.toUpperCase()}`, `${order.id} (Fee: Rs. ${check.returnFeeCharged})`);
  realtimeHub.broadcast('marketplace_update', { order });
  realtimeHub.broadcast('escrow_update', { orderRef: order.id });
  res.json({ order, verification: check, returnsUsedThisMonth: state.userMonthlyReturns[order.customerId] ?? 0 });
});

marketplaceAiRouter.post('/orders/:id/chat', (req, res) => {
  const { sender, text } = req.body as { sender: 'customer' | 'merchant'; text: string };
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Message text is required' });
    return;
  }
  const state = db.get();
  const order = state.marketplaceOrders.find((o) => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  order.chatMessages.push({
    sender,
    text: text.trim(),
    at: new Date().toISOString(),
  });
  db.commit();
  realtimeHub.broadcast('marketplace_update', { order });
  res.json({ order });
});

/**
 * Merchant "AI Magic Listing" using gemini-4-hydrogen Vision + Voice/Text
 */
marketplaceAiRouter.post('/ai-magic-listing', async (req, res) => {
  const {
    voiceOrTextPrompt,
    imageBase64,
    imageMimeType,
    shopName = 'Zoram Store',
    district = 'Aizawl',
    veng = 'Dawrpui',
  } = req.body as {
    voiceOrTextPrompt?: string;
    imageBase64?: string;
    imageMimeType?: string;
    shopName?: string;
    district?: MizoramDistrict;
    veng?: string;
  };

  if (!voiceOrTextPrompt && !imageBase64) {
    res.status(400).json({ error: 'Provide a product description/voice note or a product photo.' });
    return;
  }

  try {
    const ai = getGeminiClient();
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
        },
      });
    }

    parts.push({
      text: `You are a bilingual Mizo + English hyperlocal e-commerce merchandiser in ${district}, Mizoram.
Analyze the merchant's input (photo and/or voice/text transcript) and extract a structured studio product listing.
Merchant input: "${voiceOrTextPrompt || 'Analyze attached product photo'}"
Shop: ${shopName}, District: ${district}, Veng: ${veng}.
Also recommend hygieneCategory ('standard', 'innerwear', 'opened_cosmetics', or 'perishable_food') and studioBackgroundStyle describing how to clean up messy shop backgrounds into a clean travertine studio shot.`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titleEn: { type: Type.STRING },
            titleMiz: { type: Type.STRING },
            category: { type: Type.STRING },
            hygieneCategory: { type: Type.STRING },
            color: { type: Type.STRING },
            size: { type: Type.STRING },
            price: { type: Type.NUMBER },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            studioBackdropNote: { type: Type.STRING },
          },
          required: ['titleEn', 'titleMiz', 'category', 'hygieneCategory', 'color', 'size', 'price', 'tags', 'studioBackdropNote'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      titleEn: string;
      titleMiz: string;
      category: string;
      hygieneCategory: HygieneCategory;
      color: string;
      size: string;
      price: number;
      tags: string[];
      studioBackdropNote: string;
    };

    const validHygiene: HygieneCategory = (
      ['standard', 'innerwear', 'opened_cosmetics', 'perishable_food'].includes(parsed.hygieneCategory)
        ? parsed.hygieneCategory
        : 'standard'
    ) as HygieneCategory;

    const newProduct: MarketplaceProduct = {
      id: `prd-${Date.now().toString().slice(-5)}`,
      shopId: `shop-${district.toLowerCase()}-${veng.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      shopName,
      district,
      veng,
      titleEn: parsed.titleEn,
      titleMiz: parsed.titleMiz,
      category: parsed.category,
      hygieneCategory: validHygiene,
      checkBeforePayEligible: validHygiene === 'standard',
      price: Math.max(50, Math.round(parsed.price || 450)),
      color: parsed.color || 'Natural',
      size: parsed.size || 'Standard',
      tags: parsed.tags?.slice(0, 6) || ['mizoram', district.toLowerCase()],
      imageUrl: imageBase64
        ? imageBase64
        : '/src/assets/images/market_bamboo_craft_1794891320417.jpg',
      stock: 10,
    };

    const state = db.get();
    state.products.unshift(newProduct);
    db.addAudit(shopName, 'AI_MAGIC_LISTING', `Created ${newProduct.titleEn} (${newProduct.titleMiz})`);
    realtimeHub.broadcast('marketplace_update', { product: newProduct });

    res.status(201).json({
      product: newProduct,
      studioBackdropNote: parsed.studioBackdropNote,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI Magic Listing failed';
    res.status(502).json({ error: message });
  }
});
