import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Edit3,
  Globe,
  HardDrive,
  HeartHandshake,
  LogIn,
  LogOut,
  MapPin,
  Phone,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  User,
  UserCheck,
  UserPlus,
  Wallet,
  Wrench,
} from 'lucide-react';
import type {
  AppMode,
  AppRemoteConfig,
  CustomerWalletState,
  EmergencySosTicket,
  ErrandRequest,
  Language,
  MarketplaceOrder,
  MizoramDistrict,
  SavedPlace,
  StaffingBooking,
} from '../shared/types';
import { TRANSLATIONS } from '../i18n/translations';
import {
  ALL_MIZORAM_DISTRICT_NAMES,
  getDistrictInfo,
  getVengsForDistrict,
} from '../data/mizoramDistricts';
import { StandaloneInstallCard } from '../lib/pwa';
import { triggerHaptic } from '../lib/nativeBridge';
import { useFirebaseAuth } from '../lib/firebase';
import { resolveAddressFromCoords, startLiveGpsWatch } from '../lib/geolocation';
import { compressImageToWebP } from '../lib/offlineCache';
import type { UserAppSettings, UserProfileIdentity } from '../lib/userSettings';

interface MobileProfileViewProps {
  lang: Language;
  onToggleLang: () => void;
  selectedDistrict: MizoramDistrict;
  onChangeDistrict: (d: MizoramDistrict) => void;
  activeUserMode: 'customer' | 'partner' | 'staff' | 'merchant' | 'technician' | 'apply';
  onSelectMode: (mode: AppMode) => void;
  remoteConfig: AppRemoteConfig;
  userSettings: UserAppSettings;
  onUpdateUserSettings?: (patch: Partial<UserAppSettings>) => void;
  onOpenSettings: () => void;
  customerWallet?: CustomerWalletState;
  errandsCount?: number;
  ordersCount?: number;
  contractsCount?: number;
  sosCount?: number;
  monthlyReturnsUsed?: number;
  errands?: ErrandRequest[];
  orders?: MarketplaceOrder[];
  staffingBookings?: StaffingBooking[];
  sosTickets?: EmergencySosTicket[];
}

export const MobileProfileView: React.FC<MobileProfileViewProps> = ({
  lang,
  onToggleLang,
  selectedDistrict,
  onChangeDistrict,
  activeUserMode,
  onSelectMode,
  remoteConfig,
  userSettings,
  onUpdateUserSettings,
  onOpenSettings,
  customerWallet,
  errands = [],
  orders = [],
  staffingBookings = [],
  sosTickets = [],
  monthlyReturnsUsed = 0,
}) => {
  const t = TRANSLATIONS[lang];
  const districtInfo = getDistrictInfo(selectedDistrict);
  const {
    user,
    profile,
    effectiveRole,
    driveConnected,
    firestoreOnline,
    loading: authLoading,
    authError,
    signInWithGoogle,
    disconnectDriveToken,
    signOutFirebase,
    syncProfileDistrict,
    syncUserProfileIdentity,
  } = useFirebaseAuth();

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [showPhoneInfo, setShowPhoneInfo] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [detectingHomeGps, setDetectingHomeGps] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );

  // Editable Profile Form State
  const [draftProfile, setDraftProfile] = useState<UserProfileIdentity>(userSettings.profile);

  useEffect(() => {
    setDraftProfile(userSettings.profile);
  }, [userSettings.profile]);

  // Saved Places Self-Service CRUD State
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [placeDistrict, setPlaceDistrict] = useState<MizoramDistrict>(selectedDistrict);
  const [placeVeng, setPlaceVeng] = useState(getVengsForDistrict(selectedDistrict)[0]?.name || 'Dawrpui');
  const [placeLandmark, setPlaceLandmark] = useState('');
  const [detectingPlaceGps, setDetectingPlaceGps] = useState(false);

  const homeDistrictVengs = getVengsForDistrict(draftProfile.homeDistrict || selectedDistrict);
  const placeDistrictVengs = getVengsForDistrict(placeDistrict);

  const handleAutoDetectHomeGps = () => {
    triggerHaptic('medium');
    setDetectingHomeGps(true);
    setProfileNotice(null);
    const watcher = startLiveGpsWatch(
      (fix) => {
        void resolveAddressFromCoords(
          fix.lat,
          fix.lng,
          draftProfile.homeDistrict || selectedDistrict,
          fix.accuracyMeters
        ).then((resolved) => {
          setDraftProfile((prev) => ({
            ...prev,
            homeDistrict: resolved.district,
            homeVeng: resolved.veng,
            ymaSection: prev.ymaSection || `${resolved.zone} Zone YMA`,
            houseLandmark: resolved.landmark || prev.houseLandmark,
            lat: Number(fix.lat.toFixed(6)),
            lng: Number(fix.lng.toFixed(6)),
          }));
          setDetectingHomeGps(false);
          watcher.stop();
          triggerHaptic('success');
          setProfileNotice({
            type: 'ok',
            msg:
              lang === 'miz'
                ? `GPS Location lak fel a ni: ${resolved.veng} (${resolved.district}) · ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)} (±${fix.accuracyMeters}m)`
                : `Home GPS detected: ${resolved.veng} (${resolved.district}) · ${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)} (±${fix.accuracyMeters}m)`,
          });
        });
      },
      (errMsg) => {
        setDetectingHomeGps(false);
        setProfileNotice({ type: 'err', msg: errMsg });
      },
      { maxAutoRefineMs: 7000 }
    );
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const webpDataUrl = await compressImageToWebP(file, 320);
      setDraftProfile((prev) => ({ ...prev, avatarUrl: webpDataUrl }));
      onUpdateUserSettings?.({
        profile: {
          ...userSettings.profile,
          avatarUrl: webpDataUrl,
          updatedAt: new Date().toISOString(),
        },
      });
      triggerHaptic('success');
      setProfileNotice({
        type: 'ok',
        msg:
          lang === 'miz'
            ? 'Profile thlalak thlak fel a ni!'
            : 'Profile avatar photo updated!',
      });
    } catch {
      setProfileNotice({
        type: 'err',
        msg: 'Could not process image file.',
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftProfile.fullName.trim().length < 2) {
      setProfileNotice({
        type: 'err',
        msg:
          lang === 'miz'
            ? 'I hming kimchang ziak rawh (character 2+).'
            : 'Please enter your full name (at least 2 characters).',
      });
      return;
    }

    setSavingProfile(true);
    setProfileNotice(null);
    triggerHaptic('medium');

    const nextProfile: UserProfileIdentity = {
      ...draftProfile,
      fullName: draftProfile.fullName.trim(),
      phone: draftProfile.phone.trim(),
      email: draftProfile.email.trim(),
      upiId: draftProfile.upiId.trim(),
      homeVeng: draftProfile.homeVeng.trim(),
      ymaSection: draftProfile.ymaSection.trim(),
      houseLandmark: draftProfile.houseLandmark.trim(),
      bioNote: draftProfile.bioNote.trim(),
      emergencyContactName: draftProfile.emergencyContactName.trim(),
      emergencyContactPhone: draftProfile.emergencyContactPhone.trim(),
      updatedAt: new Date().toISOString(),
    };

    try {
      onUpdateUserSettings?.({ profile: nextProfile });
      if (nextProfile.homeDistrict !== selectedDistrict) {
        onChangeDistrict(nextProfile.homeDistrict);
      }

      // Sync with backend profile endpoint
      await fetch('/api/auth-kyc/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextProfile),
      }).catch(() => {});

      // Sync with Firebase Firestore if signed in
      await syncUserProfileIdentity({
        displayName: nextProfile.fullName,
        district: nextProfile.homeDistrict,
        phone: nextProfile.phone,
        email: nextProfile.email,
      });

      triggerHaptic('success');
      setEditingProfile(false);
      setProfileNotice({
        type: 'ok',
        msg:
          lang === 'miz'
            ? 'I Profile kimchang tha taka save leh sync fel a ni!'
            : 'Your personal profile has been saved and synced across ZoRûn!',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAutoDetectSavedPlaceGps = () => {
    triggerHaptic('medium');
    setDetectingPlaceGps(true);
    const watcher = startLiveGpsWatch(
      (fix) => {
        void resolveAddressFromCoords(fix.lat, fix.lng, placeDistrict, fix.accuracyMeters).then(
          (resolved) => {
            setPlaceDistrict(resolved.district);
            setPlaceVeng(resolved.veng);
            setPlaceLandmark(
              `${resolved.landmark} (${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)})`
            );
            setDetectingPlaceGps(false);
            watcher.stop();
            triggerHaptic('success');
          }
        );
      },
      () => {
        setDetectingPlaceGps(false);
      },
      { maxAutoRefineMs: 7000 }
    );
  };

  const handleSavePlace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeLabel.trim() || !placeVeng.trim()) return;
    triggerHaptic('success');

    if (editingPlaceId) {
      const updated = userSettings.savedPlaces.map((p) =>
        p.id === editingPlaceId
          ? {
              ...p,
              label: placeLabel.trim(),
              district: placeDistrict,
              veng: placeVeng.trim(),
              landmark: placeLandmark.trim() || undefined,
            }
          : p
      );
      onUpdateUserSettings?.({ savedPlaces: updated });
    } else {
      const nextPlace: SavedPlace = {
        id: `plc-${Date.now().toString().slice(-5)}`,
        label: placeLabel.trim(),
        district: placeDistrict,
        veng: placeVeng.trim(),
        landmark: placeLandmark.trim() || undefined,
      };
      onUpdateUserSettings?.({
        savedPlaces: [nextPlace, ...userSettings.savedPlaces].slice(0, 12),
      });
    }

    setPlaceLabel('');
    setPlaceLandmark('');
    setEditingPlaceId(null);
    setShowAddPlace(false);
  };

  const handleEditPlace = (place: SavedPlace) => {
    triggerHaptic('light');
    setEditingPlaceId(place.id);
    setPlaceLabel(place.label);
    setPlaceDistrict(place.district);
    setPlaceVeng(place.veng);
    setPlaceLandmark(place.landmark || '');
    setShowAddPlace(true);
  };

  const handleDeletePlace = (id: string) => {
    triggerHaptic('medium');
    onUpdateUserSettings?.({
      savedPlaces: userSettings.savedPlaces.filter((p) => p.id !== id),
    });
  };

  const workspaces: Array<{
    mode: 'customer' | 'partner' | 'staff' | 'merchant' | 'technician' | 'apply';
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    tint: string;
  }> = [
    {
      mode: 'customer',
      title: lang === 'miz' ? 'Customer Super-App' : 'Customer Super-App',
      subtitle:
        lang === 'miz'
          ? 'Runner, En Hmasak Bazar, Awmpui & 24×7 SOS'
          : 'Book Runner, shop En Hmasak, Awmpui & SOS',
      icon: <User className="w-5 h-5 text-emerald-700" />,
      tint: 'bg-emerald-50',
    },
    {
      mode: 'partner',
      title: lang === 'miz' ? 'Runner & Fleet Driver Portal' : 'Runner & Fleet Driver Portal',
      subtitle:
        lang === 'miz'
          ? 'Runner, Bike, Taxi & Pickup job hmuhna + GPS & OTP'
          : 'Runner, Bike, Taxi & Pickup jobs, live GPS & OTP',
      icon: <Truck className="w-5 h-5 text-teal-700" />,
      tint: 'bg-teal-50',
    },
    {
      mode: 'staff',
      title: lang === 'miz' ? 'Awmpui & Family Driver Portal' : 'Awmpui & Family Driver Portal',
      subtitle:
        lang === 'miz'
          ? 'Ka Contract, Attendance, Chawlh Dilna, Payslip & Worker SOS'
          : 'Active contract, daily check-in, leave, payslips & SOS',
      icon: <UserCheck className="w-5 h-5 text-indigo-700" />,
      tint: 'bg-indigo-50',
    },
    {
      mode: 'merchant',
      title: lang === 'miz' ? 'Dawr Neitu (Merchant Portal)' : 'Merchant Shop Portal',
      subtitle:
        lang === 'miz'
          ? 'AI Magic Listing & En Hmasak Phawt orders'
          : 'AI Magic Listing & Check-Before-Pay orders',
      icon: <Store className="w-5 h-5 text-amber-700" />,
      tint: 'bg-amber-50',
    },
    {
      mode: 'technician',
      title: lang === 'miz' ? '24×7 SOS Technician Portal' : '24×7 SOS Responder Portal',
      subtitle:
        lang === 'miz'
          ? '3-Shift Emergency alert dawnna, spare parts & chinfelna'
          : '3-Shift emergency dispatch queue, parts & resolution',
      icon: <Wrench className="w-5 h-5 text-red-700" />,
      tint: 'bg-red-50',
    },
    {
      mode: 'apply',
      title:
        lang === 'miz'
          ? 'Hnathawk / Driver Dilna (Join ZoRûn)'
          : 'Apply as Awmpui / Driver / Runner',
      subtitle:
        lang === 'miz'
          ? 'Awmpui, Family Driver, Runner & Taxi KYC thehluhna'
          : 'Submit KYC & YMA/VC reference straight to HR Vetting',
      icon: <UserPlus className="w-5 h-5 text-emerald-800" />,
      tint: 'bg-emerald-100/80',
    },
  ];

  const handleDistrictChange = (next: MizoramDistrict) => {
    onChangeDistrict(next);
    void syncProfileDistrict(next);
  };

  const activeAvatar =
    userSettings.profile.avatarUrl ||
    user?.photoURL ||
    profile?.photoUrl ||
    '';

  const displayFullName =
    userSettings.profile.fullName ||
    profile?.displayName ||
    user?.displayName ||
    'ZoRûn Member';

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Native Profile & Firebase Auth / Drive Hero Card */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900 p-5 sm:p-6 text-white shadow-[0_8px_28px_rgba(6,78,59,0.18)] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              {activeAvatar ? (
                <img
                  src={activeAvatar}
                  alt={displayFullName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-xl font-extrabold font-display tracking-tight">
                  {(displayFullName[0] || 'Z').toUpperCase()}
                </div>
              )}
              <label
                htmlFor="profile-avatar-upload"
                title={lang === 'miz' ? 'Profile thlalak thlakna' : 'Change profile photo'}
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md cursor-pointer transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <input
                  id="profile-avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                  {displayFullName}
                </h1>
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-100">
                  {user ? effectiveRole : 'VERIFIED MEMBER'}
                </span>
              </div>
              <p className="text-xs text-emerald-100/95 mt-0.5 truncate">
                {userSettings.profile.phone} · {user?.email || userSettings.profile.email}
              </p>
              <p className="text-xs text-emerald-200/90 mt-0.5 truncate">
                {userSettings.profile.homeVeng}, {userSettings.profile.homeDistrict} ({districtInfo.rtoCode})
                {userSettings.profile.ymaSection ? ` · ${userSettings.profile.ymaSection}` : ''}
                {typeof userSettings.profile.lat === 'number' &&
                typeof userSettings.profile.lng === 'number'
                  ? ` · GPS (${userSettings.profile.lat.toFixed(4)}, ${userSettings.profile.lng.toFixed(4)})`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setEditingProfile((prev) => !prev);
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 px-3.5 py-2 text-xs font-extrabold text-emerald-950 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {editingProfile
                ? lang === 'miz'
                  ? 'Khâr Rawh'
                  : 'Close Editor'
                : lang === 'miz'
                  ? 'Profile Siamthatna (Edit)'
                  : 'Edit My Profile'}
            </button>

            {!user ? (
              <button
                type="button"
                disabled={authLoading}
                onClick={() => {
                  triggerHaptic('medium');
                  void signInWithGoogle(selectedDistrict);
                }}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-50 active:scale-[0.98] transition-all"
              >
                <LogIn className="w-4 h-4 text-emerald-800" />
                {lang === 'miz' ? 'Google & Drive Sync' : 'Google & Drive Sync'}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                    driveConnected
                      ? 'bg-emerald-500/20 text-emerald-100'
                      : 'bg-white/10 text-emerald-200'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  {driveConnected ? 'Google Drive Synced' : 'Drive Local Fallback'}
                </span>

                {!confirmSignOut ? (
                  <button
                    type="button"
                    onClick={() => setConfirmSignOut(true)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {lang === 'miz' ? 'Chhuak' : 'Sign Out'}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-950/50 rounded-xl p-1">
                    {driveConnected && (
                      <button
                        type="button"
                        onClick={() => {
                          disconnectDriveToken();
                          setConfirmSignOut(false);
                        }}
                        className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950"
                      >
                        Unlink Drive Only
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmSignOut(false);
                        void signOutFirebase();
                      }}
                      className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      Confirm Sign Out
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSignOut(false)}
                      className="rounded-lg px-2 py-1 text-[11px] text-emerald-100"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Summary Badges for UPI Refund ID, House Landmark & Emergency SOS Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/80">
              {lang === 'miz' ? 'In / Gate Landmark' : 'Home Gate Landmark'}
            </p>
            <p className="font-semibold text-white truncate mt-0.5">
              {userSettings.profile.houseLandmark || 'Not set'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/80">
              {lang === 'miz' ? 'UPI Escrow Refund ID' : 'UPI Escrow Refund VPA'}
            </p>
            <p className="font-mono font-semibold text-white truncate mt-0.5">
              {userSettings.profile.upiId || 'Not set'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/80">
              {lang === 'miz' ? '24×7 SOS Chhungte Biak Pawhna' : 'Emergency SOS Family Contact'}
            </p>
            <p className="font-semibold text-white truncate mt-0.5">
              {userSettings.profile.emergencyContactName} ({userSettings.profile.emergencyContactPhone})
            </p>
          </div>
        </div>

        {authError && (
          <div className="rounded-xl bg-red-950/60 border border-red-400/40 px-3.5 py-2 text-xs text-red-100">
            {authError}
          </div>
        )}

        {profileNotice && (
          <div
            role="status"
            className={`rounded-2xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2 ${
              profileNotice.type === 'ok'
                ? 'bg-emerald-500/25 border border-emerald-300/40 text-emerald-50'
                : 'bg-red-950/70 border border-red-400/40 text-red-100'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{profileNotice.msg}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-100/80">
          <button
            type="button"
            onClick={() => setShowPhoneInfo((v) => !v)}
            className="inline-flex items-center gap-1.5 underline decoration-emerald-300/50 hover:text-white"
          >
            <Phone className="w-3 h-3" />
            {lang === 'miz' ? 'Phone OTP Login chungchang' : 'Phone OTP Sign-In setup note'}
          </button>
          <span>
            {user
              ? `Firestore Synced · Updated ${new Date(userSettings.profile.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Local & Server Profile Active'}
          </span>
        </div>

        {showPhoneInfo && (
          <p className="rounded-xl bg-white/10 px-3.5 py-2.5 text-[11px] text-emerald-50 leading-relaxed">
            {lang === 'miz'
              ? 'Google Sign-In & Drive Storage chu hman nghal theih a ni. Phone number OTP login hman duh chuan Firebase Console (Authentication → Sign-in method → Phone) ah enable a ngai.'
              : 'Google Sign-In and Google Drive backup work immediately. To also allow Phone OTP login for Mizo phone numbers, enable the Phone provider in Firebase Console (Authentication → Sign-in method).'}
          </p>
        )}
      </section>

      {/* ===================================================================== */}
      {/* SELF-SERVICE PERSONAL PROFILE EDITOR (INLINE CARD)                    */}
      {/* ===================================================================== */}
      {editingProfile && (
        <section className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-emerald-600/30 dark:border-emerald-500/30 p-5 sm:p-6 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                {lang === 'miz'
                  ? 'Ka Profile Leh Address Siamthatna (Self-Service Update)'
                  : 'Update Your Personal Profile & Home Location'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'miz'
                  ? 'Heta i thlak apiang hi Runner, Bazar, Awmpui Contract leh 24×7 SOS-ah a in-update nghal vek ang.'
                  : 'Changes automatically apply to your Runner bookings, Marketplace orders, Staffing contracts & 24×7 SOS.'}
              </p>
            </div>
            <button
              type="button"
              disabled={detectingHomeGps}
              onClick={handleAutoDetectHomeGps}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-3.5 py-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100"
            >
              <Crosshair className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              {detectingHomeGps
                ? lang === 'miz'
                  ? 'GPS Coordinate zawng mek...'
                  : 'Detecting GPS...'
                : lang === 'miz'
                  ? 'Live GPS-in Home Veng & Coordinate Detect Rawh'
                  : 'Auto-Detect Home Veng & GPS'}
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'Hming Kimchang (Full Name)' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={draftProfile.fullName}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'Phone Number' : 'Mobile Phone Number'}
                </label>
                <input
                  type="text"
                  required
                  value={draftProfile.phone}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'Email Address' : 'Email Address'}
                </label>
                <input
                  type="email"
                  value={draftProfile.email}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'UPI ID (Escrow Refund & Cashback)' : 'UPI ID (Refunds & Payouts)'}
                </label>
                <input
                  type="text"
                  value={draftProfile.upiId}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, upiId: e.target.value }))
                  }
                  placeholder="username@oksbi"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'Home District' : 'Home District'}
                </label>
                <select
                  value={draftProfile.homeDistrict}
                  onChange={(e) => {
                    const nextDist = e.target.value as MizoramDistrict;
                    const firstVeng = getVengsForDistrict(nextDist)[0];
                    setDraftProfile((prev) => ({
                      ...prev,
                      homeDistrict: nextDist,
                      homeVeng: firstVeng?.name || prev.homeVeng,
                      lat: firstVeng?.lat ?? prev.lat,
                      lng: firstVeng?.lng ?? prev.lng,
                    }));
                  }}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                    <option key={d} value={d}>
                      {d} ({getDistrictInfo(d).rtoCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'Awmna Veng (Home Veng)' : 'Home Veng / Locality'}
                </label>
                <select
                  value={draftProfile.homeVeng}
                  onChange={(e) => {
                    const found = homeDistrictVengs.find((v) => v.name === e.target.value);
                    setDraftProfile((prev) => ({
                      ...prev,
                      homeVeng: e.target.value,
                      lat: found?.lat ?? prev.lat,
                      lng: found?.lng ?? prev.lng,
                    }));
                  }}
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  {homeDistrictVengs.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.zone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'YMA Branch / Section' : 'YMA Section / Branch'}
                </label>
                <input
                  type="text"
                  value={draftProfile.ymaSection}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, ymaSection: e.target.value }))
                  }
                  placeholder="e.g. Section-II YMA"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz' ? 'Home GPS Coordinates (Lat, Lng)' : 'Home GPS Pin (Lat, Lng)'}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    step="0.0001"
                    value={draftProfile.lat ?? 23.7307}
                    onChange={(e) =>
                      setDraftProfile((prev) => ({
                        ...prev,
                        lat: Number(e.target.value) || prev.lat,
                      }))
                    }
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={draftProfile.lng ?? 92.7173}
                    onChange={(e) =>
                      setDraftProfile((prev) => ({
                        ...prev,
                        lng: Number(e.target.value) || prev.lng,
                      }))
                    }
                    className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz'
                    ? 'In Awmna Landmark & Kailawn/Gate Chhinchhiahna'
                    : 'House Landmark & Kailawn/Gate Directions'}
                </label>
                <input
                  type="text"
                  value={draftProfile.houseLandmark}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, houseLandmark: e.target.value }))
                  }
                  placeholder="Near Biak In steps, Blue gate on right"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz'
                    ? 'Runner / Delivery Hriattirna (Delivery Note)'
                    : 'Default Runner / Delivery Note'}
                </label>
                <input
                  type="text"
                  value={draftProfile.bioNote}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({ ...prev, bioNote: e.target.value }))
                  }
                  placeholder="Call on arrival / Ring gate bell"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz'
                    ? '24×7 Emergency SOS Chhungte Hming'
                    : 'Emergency SOS Contact Name'}
                </label>
                <input
                  type="text"
                  value={draftProfile.emergencyContactName}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      emergencyContactName: e.target.value,
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === 'miz'
                    ? '24×7 Emergency SOS Chhungte Phone Number'
                    : 'Emergency SOS Contact Phone'}
                </label>
                <input
                  type="text"
                  value={draftProfile.emergencyContactPhone}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      emergencyContactPhone: e.target.value,
                    }))
                  }
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDraftProfile(userSettings.profile);
                  setEditingProfile(false);
                }}
                className="min-h-[42px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                {lang === 'miz' ? 'Cancel' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-900 hover:bg-emerald-800 px-5 py-2 text-xs font-bold text-white shadow-sm"
              >
                <Save className="w-4 h-4" />
                {savingProfile
                  ? lang === 'miz'
                    ? 'Save mek...'
                    : 'Saving...'
                  : lang === 'miz'
                    ? 'Profile Save & Update Rawh'
                    : 'Save & Sync Profile'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ===================================================================== */}
      {/* MY ZORÛN WALLET, PLUS PASS & PERSONAL ACTIVITY OVERVIEW               */}
      {/* ===================================================================== */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4 space-y-1 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">ZoRûn Wallet</span>
            <Wallet className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            ₹{(customerWallet?.balanceRs ?? 320).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {customerWallet?.loyaltyPoints ?? 240} Loyalty Pts ·{' '}
            {customerWallet?.plusPassActive ? 'Plus Pass Active' : 'Standard Tier'}
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4 space-y-1 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-teal-800 dark:text-teal-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {lang === 'miz' ? 'Runner & Errands' : 'My Errands'}
            </span>
            <Truck className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {errands.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {errands.filter((e) => e.status !== 'completed').length}{' '}
            {lang === 'miz' ? 'kal mek' : 'active'} ·{' '}
            {errands.filter((e) => e.status === 'completed').length}{' '}
            {lang === 'miz' ? 'zo tawh' : 'completed'}
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4 space-y-1 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {lang === 'miz' ? 'Bazar & Return Quota' : 'Shop & Return Cap'}
            </span>
            <ShoppingBag className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {orders.length} Orders
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            En Hmasak Returns: {monthlyReturnsUsed}/{remoteConfig.monthlyReturnLimit} this month
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4 space-y-1 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {lang === 'miz' ? 'Awmpui & 24×7 SOS' : 'Staff & 24×7 SOS'}
            </span>
            <HeartHandshake className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
            {staffingBookings.length} / {sosTickets.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {staffingBookings.length} Contracts · {sosTickets.length} SOS Dispatches
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Saved Places Manager + App Settings */}
        <div className="lg:col-span-6 order-2 lg:order-1 space-y-5">
          {/* Self-Service Saved Places Manager */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.04)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {lang === 'miz'
                    ? 'Ka Hmun Chhinchhiahte (Saved Places)'
                    : 'My Saved Places (Home, Office, Bazar)'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'miz'
                    ? '1-Tap booking tih awlsam nan i kal fo-na Veng leh Landmark-te manage rawh'
                    : 'Add, edit, or GPS-pin your frequent destinations for 1-tap booking'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setEditingPlaceId(null);
                  setPlaceLabel('');
                  setPlaceDistrict(selectedDistrict);
                  setPlaceVeng(getVengsForDistrict(selectedDistrict)[0]?.name || 'Dawrpui');
                  setPlaceLandmark('');
                  setShowAddPlace((prev) => !prev);
                }}
                className="min-h-[38px] inline-flex items-center gap-1 rounded-xl bg-emerald-900 text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-800 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddPlace
                  ? lang === 'miz'
                    ? 'Khâr'
                    : 'Close'
                  : lang === 'miz'
                    ? 'Belh Rawh'
                    : 'Add Place'}
              </button>
            </div>

            {showAddPlace && (
              <form
                onSubmit={handleSavePlace}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {editingPlaceId
                      ? lang === 'miz'
                        ? 'Hmun Chhinchhiah Siamthatna'
                        : 'Edit Saved Place'
                      : lang === 'miz'
                        ? 'Hmun Thar Chhinchhiahna'
                        : 'New Saved Place'}
                  </span>
                  <button
                    type="button"
                    disabled={detectingPlaceGps}
                    onClick={handleAutoDetectSavedPlaceGps}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 px-2.5 py-1 text-[11px] font-bold text-emerald-900 dark:text-emerald-300"
                  >
                    <Crosshair className="w-3 h-3" />
                    {detectingPlaceGps ? 'Locating...' : 'Auto-Fill via Live GPS'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={placeLabel}
                    onChange={(e) => setPlaceLabel(e.target.value)}
                    placeholder={lang === 'miz' ? 'Hming (e.g. In / Dawr)' : 'Label (e.g. Home / Shop)'}
                    className="min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                  <select
                    value={placeDistrict}
                    onChange={(e) => {
                      const d = e.target.value as MizoramDistrict;
                      setPlaceDistrict(d);
                      setPlaceVeng(getVengsForDistrict(d)[0]?.name || d);
                    }}
                    className="min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {ALL_MIZORAM_DISTRICT_NAMES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={placeVeng}
                    onChange={(e) => setPlaceVeng(e.target.value)}
                    className="min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {placeDistrictVengs.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={placeLandmark}
                    onChange={(e) => setPlaceLandmark(e.target.value)}
                    placeholder={
                      lang === 'miz'
                        ? 'Landmark / Biak In / Kailawn chhinchhiahna'
                        : 'Nearest landmark / gate note'
                    }
                    className="flex-1 min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="min-h-[38px] rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    {editingPlaceId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {userSettings.savedPlaces.map((plc) => (
                <div
                  key={plc.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {plc.label} ·{' '}
                        <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                          {plc.veng} ({plc.district})
                        </span>
                      </p>
                      {plc.landmark && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {plc.landmark}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditPlace(plc)}
                      title="Edit place"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlace(plc.id)}
                      title="Remove place"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <StandaloneInstallCard lang={lang} />

          {/* Native Grouped Settings List */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="profile-district-select"
                    className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {t.districtLabel}
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Mizoram District 11 thlanna' : 'Active Mizoram District'}
                  </p>
                </div>
              </div>
              <select
                id="profile-district-select"
                value={selectedDistrict}
                onChange={(e) => handleDistrictChange(e.target.value as MizoramDistrict)}
                className="min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {ALL_MIZORAM_DISTRICT_NAMES.map((d) => {
                  const info = getDistrictInfo(d);
                  return (
                    <option key={d} value={d}>
                      {d} ({info.rtoCode})
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="button"
              onClick={onToggleLang}
              className="w-full p-4 min-h-[64px] flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'Tawng Thlanna (Language)' : 'App Language'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'miz' ? 'Mizo Tawng hman mek' : 'Currently English · Tap for Mizo'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                {lang === 'miz' ? 'MIZ → EN' : 'EN → MIZ'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenSettings();
              }}
              className="w-full p-4 min-h-[68px] flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <Settings className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {lang === 'miz' ? 'App Settings Khawihna' : 'App Settings & Preferences'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {userSettings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'} ·{' '}
                    {userSettings.defaultPaymentMethod === 'upi_escrow' ? 'UPI Escrow' : 'QR COD'} ·{' '}
                    {userSettings.textSize === 'large' ? 'Large Text' : 'Standard Text'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lang === 'miz' ? 'Man Inthup Awm Lo Guarantee' : 'Zero Hidden Fees Guarantee'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'miz'
                    ? '100% UPI Escrow & Rs. 3 Sachet Micro-Insurance'
                    : '100% UPI Escrow & ₹3 Sachet Micro-Insurance'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: All Role Portals & Recent Bookings Summary */}
        <div className="lg:col-span-6 order-1 lg:order-2 space-y-5">
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t.switchWorkspaceTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {lang === 'miz'
                  ? 'Customer, Runner, Awmpui emaw Dawr Neitu mode-ah thlak rawh'
                  : 'Switch between Customer, Partner, Staff, and Merchant apps'}
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspaces.map((ws) => {
                const isActive = activeUserMode === ws.mode;
                return (
                  <button
                    key={ws.mode}
                    type="button"
                    onClick={() => onSelectMode(ws.mode)}
                    className="w-full min-h-[68px] px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 active:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-2xl ${ws.tint} dark:bg-slate-800 flex items-center justify-center shrink-0`}
                      >
                        {ws.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {ws.title}
                          {isActive && (
                            <span className="ml-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              · {lang === 'miz' ? 'Hman mek' : 'Active'}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {ws.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loyalty Referral & Plus Pass Card */}
          <div className="rounded-3xl bg-gradient-to-r from-emerald-900 to-teal-900 p-5 text-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-200">
                <Sparkles className="w-4 h-4" />
                {lang === 'miz' ? 'Ka Referral Code & Loyalty' : 'My Referral Code & Loyalty'}
              </span>
              <span className="rounded-lg bg-white/15 px-2.5 py-1 font-mono text-xs font-bold">
                {customerWallet?.referralCode || 'ZORUN-MZ-2026'}
              </span>
            </div>
            <p className="text-xs text-emerald-100/90 leading-relaxed">
              {lang === 'miz'
                ? `Thiante sawmna code hmangin ₹50 Wallet Bonus leh Loyalty Points (${customerWallet?.loyaltyPoints ?? 240} pts) i dawng thei. I Profile hming (${userSettings.profile.fullName}) leh UPI ID (${userSettings.profile.upiId}) ah lut nghal thei a ni.`
                : `Share your referral code for ₹50 instant wallet bonus. Refunds and loyalty rewards automatically link to ${userSettings.profile.fullName} (${userSettings.profile.upiId}).`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
