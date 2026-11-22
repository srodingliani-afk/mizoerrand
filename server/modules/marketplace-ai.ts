import { Router } from 'express';
import { Type } from '@google/genai';
import { db } from '../infrastructure/store';
import { getGeminiClient, getGeminiModel } from '../infrastructure/geminiClient';
import { realtimeHub } from '../infrastructure/realtimeHub';
import { isTrustedMediaUrl } from '../infrastructure/driveStorage';
import {
  postEscrowHoldJournal,
  postEscrowSettlementJournal,
  recordDoubleEntryJournal,
} from '../infrastructure/ledgerService';
import {
  calculateEscrowSplit,
  evaluateSduiServiceVisibility,
  isCustomerBlacklisted,
  validateCheckBeforePayReturn,
} from '../domain/rules';
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

marketplaceAiRouter.patch('/products/:id', (req, res) => {
  const { price, stock, titleEn, titleMiz, checkBeforePayEligible } = req.body as Partial<MarketplaceProduct>;
  const state = db.get();
  const product = state.products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  if (typeof price === 'number' && price >= 10) {
    product.price = Math.round(price);
  }
  if (typeof stock === 'number' && stock >= 0) {
    product.stock = Math.round(stock);
  }
  if (typeof titleEn === 'string' && titleEn.trim()) {
    product.titleEn = titleEn.trim();
  }
  if (typeof titleMiz === 'string' && titleMiz.trim()) {
    product.titleMiz = titleMiz.trim();
  }
  if (typeof checkBeforePayEligible === 'boolean' && product.hygieneCategory === 'standard') {
    product.checkBeforePayEligible = checkBeforePayEligible;
  }
  db.addAudit(product.shopName, 'PRODUCT_UPDATED', `${product.id} (Rs. ${product.price}, Stock: ${product.stock})`);
  realtimeHub.broadcast('marketplace_update', { product });
  res.json({ product });
});

marketplaceAiRouter.delete('/products/:id', (req, res) => {
  const state = db.get();
  const idx = state.products.findIndex((p) => p.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  const [removed] = state.products.splice(idx, 1);
  db.addAudit(removed.shopName, 'PRODUCT_DELETED', `${removed.id} (${removed.titleEn})`);
  realtimeHub.broadcast('marketplace_update', { deletedProductId: removed.id });
  res.json({ deleted: removed.id });
});

marketplaceAiRouter.post('/orders', (req, res) => {
  const state = db.get();
  const visibility = evaluateSduiServiceVisibility(state.remoteConfig, state.plugins);
  if (!visibility.marketplace) {
    res.status(403).json({
      error: 'Sunday Emergency Mode is active: non-emergency retail marketplace is paused today.',
    });
    return;
  }

  const {
    customerId = 'cust-1',
    customerName,
    productId,
    microInsuranceOptIn = true,
    payWithWallet = false,
    voiceNoteUrl,
    voiceNoteDurationSec,
    voiceNoteTranscript,
  } = req.body as {
    customerId?: string;
    customerName?: string;
    productId: string;
    microInsuranceOptIn?: boolean;
    payWithWallet?: boolean;
    voiceNoteUrl?: string;
    voiceNoteDurationSec?: number;
    voiceNoteTranscript?: string;
  };

  if (isCustomerBlacklisted(state.blacklistedCustomers, customerId, customerName)) {
    res.status(403).json({
      error: 'Account suspended due to repeated prank bookings or return abuse.',
    });
    return;
  }

  const product = state.products.find((p) => p.id === productId);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  if (product.stock <= 0) {
    res.status(400).json({ error: 'Product is currently out of stock' });
    return;
  }

  const deliveryFee = 55;
  const microInsuranceFee = microInsuranceOptIn ? state.remoteConfig.microInsuranceSachetRs : 0;
  const allInclusiveTotal = product.price + deliveryFee + microInsuranceFee;

  if (payWithWallet) {
    if (state.customerWallet.balanceRs < allInclusiveTotal) {
      res.status(400).json({
        error: `Insufficient ZoRûn Wallet balance (₹${state.customerWallet.balanceRs}) for ₹${allInclusiveTotal} order.`,
      });
      return;
    }
    state.customerWallet.balanceRs -= allInclusiveTotal;
    state.customerWallet.loyaltyPoints += Math.max(5, Math.round(allInclusiveTotal / 40));
    state.customerWallet.transactions.unshift({
      id: `wtx-${Date.now()}`,
      type: 'parcel_payment',
      title: `Marketplace Order (${product.titleEn})`,
      amountRs: -allInclusiveTotal,
      pointsDelta: Math.max(5, Math.round(allInclusiveTotal / 40)),
      createdAt: new Date().toISOString(),
    });
  }

  product.stock = Math.max(0, product.stock - 1);

  const cleanVoiceUrl = isTrustedMediaUrl(voiceNoteUrl, 'audio');
  const cleanDuration =
    typeof voiceNoteDurationSec === 'number' && Number.isFinite(voiceNoteDurationSec)
      ? Math.max(1, Math.min(15, Math.round(voiceNoteDurationSec)))
      : undefined;
  const cleanTranscript =
    typeof voiceNoteTranscript === 'string' && voiceNoteTranscript.trim()
      ? voiceNoteTranscript.trim().slice(0, 200)
      : undefined;

  const targetDistrict = product.district || 'Aizawl';
  const assignedRunner =
    state.partners.find(
      (p) =>
        p.online &&
        (p.district || 'Aizawl') === targetDistrict &&
        (p.category === 'walker' || p.category === 'bike')
    ) ||
    state.partners.find((p) => p.online && (p.district || 'Aizawl') === targetDistrict) ||
    state.partners.find((p) => p.online);

  const chatMessages: MarketplaceOrder['chatMessages'] = [
    {
      sender: 'merchant',
      text: `Chibai! Your order from ${product.shopName} (${product.veng}) is packed.${
        assignedRunner ? ` Runner ${assignedRunner.name} assigned for doorstep delivery & inspection.` : ''
      }`,
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
    district: targetDistrict,
    veng: product.veng,
    price: product.price,
    deliveryFee,
    microInsuranceFee,
    allInclusiveTotal,
    checkBeforePay: product.checkBeforePayEligible,
    hygieneCategory: product.hygieneCategory,
    returnFeeOnReject: state.remoteConfig.returnDeliveryFee,
    status: 'awaiting_inspection',
    assignedPartnerId: assignedRunner?.id,
    assignedPartnerName: assignedRunner?.name,
    paidViaWallet: Boolean(payWithWallet),
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
  if (order.status !== 'awaiting_inspection') {
    res.status(400).json({ error: 'Order has already been inspected and settled' });
    return;
  }

  const currentReturns = state.userMonthlyReturns[order.customerId] ?? 0;
  const check = validateCheckBeforePayReturn({
    hygieneCategory: order.hygieneCategory,
    userReturnsThisMonth: currentReturns,
    monthlyReturnLimit: state.remoteConfig.monthlyReturnLimit,
    returnDeliveryFee: state.remoteConfig.returnDeliveryFee,
    action,
    plugins: state.plugins,
  });

  if (!check.allowed) {
    res.status(400).json({ error: check.reason, canOpenBox: check.canOpenBox });
    return;
  }

  const deliveryPartner = state.partners.find((p) => p.id === order.assignedPartnerId);

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
    if (deliveryPartner) {
      deliveryPartner.walletBalance += split.partnerPayout;
      deliveryPartner.completedJobs += 1;
    }
    postEscrowHoldJournal(state, {
      orderRef: order.id,
      customerId: order.customerId,
      grossAllInclusive: order.allInclusiveTotal,
      paymentMode: 'upi_escrow',
    });
    postEscrowSettlementJournal(state, {
      entry,
      partnerId: deliveryPartner?.id,
      merchantId: order.shopName,
    });
  } else {
    order.status = 'rejected_return_fee_charged';
    state.userMonthlyReturns[order.customerId] = currentReturns + 1;
    const product = state.products.find((p) => p.id === order.productId);
    if (product) {
      product.stock += 1;
    }
    const gstAmount = Math.round((check.returnFeeCharged * 18) / 118);
    const partnerPayout = check.returnFeeCharged - 5 - gstAmount;
    if (deliveryPartner) {
      deliveryPartner.walletBalance += partnerPayout;
      deliveryPartner.completedJobs += 1;
    }
    if (order.paidViaWallet && order.allInclusiveTotal > check.returnFeeCharged) {
      const refundAmt = order.allInclusiveTotal - check.returnFeeCharged;
      state.customerWallet.balanceRs += refundAmt;
      state.customerWallet.transactions.unshift({
        id: `wtx-${Date.now()}`,
        type: 'topup',
        title: `Check-Before-Pay Return Refund (${order.id})`,
        amountRs: refundAmt,
        createdAt: new Date().toISOString(),
      });
    }
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
        { account: `PAYABLE:PARTNER:${deliveryPartner?.id || 'fleet'}`, side: 'credit', amountRs: partnerPayout },
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
      model: getGeminiModel(),
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
