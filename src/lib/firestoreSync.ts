import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  OperationType,
  firebaseAuth,
  firestoreDb,
  handleFirestoreError,
} from './firebase';
import type {
  EmergencySosTicket,
  ErrandRequest,
  MizoramDistrict,
  PartnerProfile,
} from '../shared/types';

export interface FirestoreLiveRunner {
  partnerId: string;
  ownerUid: string;
  name: string;
  district: MizoramDistrict;
  veng: string;
  category: 'walker' | 'bike' | 'auto_taxi' | 'pickup_truck';
  online: boolean;
  lat: number;
  lng: number;
  accuracyMeters?: number;
}

export interface FirestoreLiveOrder {
  orderId: string;
  customerUid: string;
  assignedRunnerUid?: string;
  district: MizoramDistrict;
  title: string;
  jobType: ErrandRequest['jobType'];
  status: ErrandRequest['status'];
  allInclusiveTotal: number;
  kailawnSurchargeRs?: number;
}

export interface FirestoreLiveSos {
  ticketId: string;
  customerUid: string;
  assignedTechUid?: string;
  district: MizoramDistrict;
  veng: string;
  category: string;
  lat: number;
  lng: number;
  status: EmergencySosTicket['status'];
  assignedTechName?: string;
  slaTargetMinutes: number;
}

function clampMizoramLat(lat: number): number {
  if (!Number.isFinite(lat)) return 23.7271;
  return Math.max(21.0, Math.min(25.5, Number(lat.toFixed(6))));
}

function clampMizoramLng(lng: number): number {
  if (!Number.isFinite(lng)) return 92.7176;
  return Math.max(91.5, Math.min(94.0, Number(lng.toFixed(6))));
}

function sanitizeRuleId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || `item_${Date.now()}`;
}

export function subscribeDistrictRunners(
  district: MizoramDistrict,
  isAdmin: boolean,
  onUpdate: (runners: FirestoreLiveRunner[]) => void
): Unsubscribe {
  const path = `districts/${district}/runners`;
  const runnersRef = collection(firestoreDb, 'districts', district, 'runners');
  // Non-admins MUST constrain the query to match firestore.rules `allow list`
  const q = isAdmin ? query(runnersRef) : query(runnersRef, where('online', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const next: FirestoreLiveRunner[] = [];
      snapshot.forEach((docSnap) => {
        next.push(docSnap.data() as FirestoreLiveRunner);
      });
      onUpdate(next);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Non-fatal when disconnected or unverified
      }
    }
  );
}

export function subscribeDistrictOrders(
  district: MizoramDistrict,
  uid: string,
  isAdmin: boolean,
  onUpdate: (orders: FirestoreLiveOrder[]) => void
): Unsubscribe {
  const path = `districts/${district}/orders`;
  const ordersRef = collection(firestoreDb, 'districts', district, 'orders');

  if (isAdmin) {
    return onSnapshot(
      query(ordersRef),
      (snap) => {
        const list: FirestoreLiveOrder[] = [];
        snap.forEach((d) => list.push(d.data() as FirestoreLiveOrder));
        onUpdate(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch {
          // Ignore non-fatal sync interruptions
        }
      }
    );
  }

  // Merge customer-owned orders + open bidding orders so Firestore list rules are always satisfied
  const mapById = new Map<string, FirestoreLiveOrder>();
  const emit = () => onUpdate(Array.from(mapById.values()));

  const unsubMine = onSnapshot(
    query(ordersRef, where('customerUid', '==', uid)),
    (snap) => {
      snap.forEach((d) => {
        const item = d.data() as FirestoreLiveOrder;
        mapById.set(item.orderId, item);
      });
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `${path}?customerUid=${uid}`);
      } catch {
        // Ignore
      }
    }
  );

  const unsubBidding = onSnapshot(
    query(ordersRef, where('status', '==', 'bidding')),
    (snap) => {
      snap.forEach((d) => {
        const item = d.data() as FirestoreLiveOrder;
        mapById.set(item.orderId, item);
      });
      emit();
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `${path}?status=bidding`);
      } catch {
        // Ignore
      }
    }
  );

  return () => {
    unsubMine();
    unsubBidding();
  };
}

export function subscribeDistrictSos(
  district: MizoramDistrict,
  uid: string,
  isAdmin: boolean,
  onUpdate: (tickets: FirestoreLiveSos[]) => void
): Unsubscribe {
  const path = `districts/${district}/sos`;
  const sosRef = collection(firestoreDb, 'districts', district, 'sos');
  const q = isAdmin ? query(sosRef) : query(sosRef, where('customerUid', '==', uid));

  return onSnapshot(
    q,
    (snap) => {
      const list: FirestoreLiveSos[] = [];
      snap.forEach((d) => list.push(d.data() as FirestoreLiveSos));
      onUpdate(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Ignore
      }
    }
  );
}

export async function publishRunnerLocationToFirestore(params: {
  partner: PartnerProfile;
  lat: number;
  lng: number;
  accuracyMeters?: number;
}): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  const district = params.partner.district || 'Aizawl';
  const partnerId = sanitizeRuleId(params.partner.id);
  const path = `districts/${district}/runners/${partnerId}`;

  const payload: Record<string, unknown> = {
    partnerId,
    ownerUid: user.uid,
    name: params.partner.name.slice(0, 80),
    district,
    veng: params.partner.veng.slice(0, 80),
    category: params.partner.category,
    online: params.partner.online,
    lat: clampMizoramLat(params.lat),
    lng: clampMizoramLng(params.lng),
    updatedAt: serverTimestamp(),
  };

  if (typeof params.accuracyMeters === 'number' && Number.isFinite(params.accuracyMeters)) {
    payload.accuracyMeters = Math.max(0, Math.min(5000, Math.round(params.accuracyMeters)));
  }

  try {
    await setDoc(doc(firestoreDb, 'districts', district, 'runners', partnerId), payload, {
      merge: true,
    });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch {
      // Non-fatal background sync
    }
  }
}

export async function publishLiveOrderToFirestore(job: ErrandRequest): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  const district = job.district || 'Aizawl';
  const orderId = sanitizeRuleId(job.id);
  const path = `districts/${district}/orders/${orderId}`;

  const payload: Record<string, unknown> = {
    orderId,
    customerUid: user.uid,
    district,
    title: job.title.slice(0, 160),
    jobType: job.jobType,
    status: job.status,
    allInclusiveTotal: Math.max(0, Math.min(100000, Math.round(job.allInclusiveTotal))),
    kailawnSurchargeRs: Math.max(0, Math.min(500, Math.round(job.kailawnSurchargeRs || 0))),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(firestoreDb, 'districts', district, 'orders', orderId), payload);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.CREATE, path);
    } catch {
      // Express API remains authoritative fallback
    }
  }
}

export async function publishSosAlertToFirestore(ticket: EmergencySosTicket): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  const district = ticket.district || 'Aizawl';
  const ticketId = sanitizeRuleId(ticket.id);
  const path = `districts/${district}/sos/${ticketId}`;

  const payload: Record<string, unknown> = {
    ticketId,
    customerUid: user.uid,
    district,
    veng: ticket.veng.slice(0, 80),
    category: ticket.category.slice(0, 64),
    lat: clampMizoramLat(ticket.lat),
    lng: clampMizoramLng(ticket.lng),
    status: ticket.status,
    assignedTechName: ticket.assignedTechName.slice(0, 80),
    slaTargetMinutes: Math.max(1, Math.min(120, Math.round(ticket.slaTargetMinutes))),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(firestoreDb, 'districts', district, 'sos', ticketId), payload);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.CREATE, path);
    } catch {
      // Express API remains authoritative fallback
    }
  }
}
