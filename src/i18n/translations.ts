import type { Language } from '../shared/types';

export const TRANSLATIONS: Record<
  Language,
  {
    brand: string;
    navCustomer: string;
    navPartner: string;
    navMerchant: string;
    navAdmin: string;
    navDevStudio: string;
    sosCta: string;
    heroTitle: string;
    heroSubtitle: string;
    heroAction: string;
    districtLabel: string;
    allDistrictsLabel: string;
    sundayBanner: string;
    allInclusiveNote: string;
    tabErrands: string;
    tabMarketplace: string;
    tabWorkforce: string;
    tabSos: string;
    postErrand: string;
    addStop: string;
    terrainVehicle: string;
    terrainSteps: string;
    microInsuranceLabel: string;
    checkBeforePayTitle: string;
    checkBeforePayDesc: string;
    workforceTitle: string;
    sosTitle: string;
    partnerTitle: string;
    merchantTitle: string;
    adminTitle: string;
    devStudioTitle: string;
  }
> = {
  en: {
    brand: 'ZoRun',
    navCustomer: 'Customer',
    navPartner: 'Partner',
    navMerchant: 'Merchant',
    navAdmin: 'Admin',
    navDevStudio: 'Dev Studio',
    sosCta: '24x7 SOS',
    heroTitle: 'Built for all 11 Mizoram District Capitals, hills & hyperlocal Vengs.',
    heroSubtitle:
      'On-foot Tirhkah for steep Veng stairs, corridor-matched riders, Check-Before-Pay shops, vetted Awmpui staffing, and 24x7 emergency technicians across Aizawl, Lunglei, Champhai, Serchhip, Kolasib, Lawngtlai, Mamit, Siaha, Saitual, Khawzawl & Hnahthial.',
    heroAction: 'Book an Errand',
    districtLabel: 'District Capital',
    allDistrictsLabel: 'All 11 Districts',
    sundayBanner:
      'Sunday Emergency Mode Active — Commercial retail is paused in respect of Sunday observance. 24x7 Rapid Emergency & Essential Errands remain live.',
    allInclusiveNote: 'Single all-inclusive price · Zero hidden fees',
    tabErrands: 'Errands & Fleet',
    tabMarketplace: 'Marketplace',
    tabWorkforce: 'Workforce & Awmpui',
    tabSos: '24x7 Rapid SOS',
    postErrand: 'Post Errand for Bids',
    addStop: '+ Add Stop',
    terrainVehicle: 'Vehicle Accessible',
    terrainSteps: 'Long Steps Walk (Walker Only)',
    microInsuranceLabel: 'Add Rs. 3 Sachet Micro-Insurance (Transit & Accident Cover)',
    checkBeforePayTitle: 'En Hmasak Phawt · Check-Before-Pay',
    checkBeforePayDesc:
      'Inspect eligible items at your gate before paying. Mandatory Rs. 45 return delivery fee on rejection; hygiene exclusions apply.',
    workforceTitle: 'Home Workforce & Company-Managed Awmpui / Drivers',
    sosTitle: '24x7 Rapid Emergency Response Center',
    partnerTitle: 'Partner Console · Tirhkah, Rider & Shift Technician',
    merchantTitle: 'Merchant Portal · AI Magic Listing & Order Safeguards',
    adminTitle: 'Operations Command Center',
    devStudioTitle: 'Server Developer Studio & AI Software Engineer',
  },
  miz: {
    brand: 'ZoRun',
    navCustomer: 'Customer',
    navPartner: 'Tirhkah / Partner',
    navMerchant: 'Dawr Neitu',
    navAdmin: 'Admin',
    navDevStudio: 'Dev Studio',
    sosCta: '24x7 SOS',
    heroTitle: 'Mizoram District Khawpui 11 zawng zawng, tlangram leh Veng tin tana siam.',
    heroSubtitle:
      'Aizawl, Lunglei, Champhai, Serchhip, Kolasib, Lawngtlai, Mamit, Siaha, Saitual, Khawzawl & Hnahthial-ah Ke-a kal Tirhkah, rider, En Hmasak Phawt dawr, Awmpui rintlak leh 24x7 emergency technician man inthup awm lo.',
    heroAction: 'Tirhkah Ko Rawh',
    districtLabel: 'District Khawpui',
    allDistrictsLabel: 'District 11 zawng zawng',
    sundayBanner:
      'Pathianni Emergency Mode a nung mek — Dawr pui khar a ni a, 24x7 Rapid Emergency leh thil pawimawh bik erawh hman theih reng a ni.',
    allInclusiveNote: 'Man pumhlum vek · Chhiah leh fee inthup a awm lo',
    tabErrands: 'Tirhkah & Motor',
    tabMarketplace: 'Bazar (En Hmasak)',
    tabWorkforce: 'Hnathawk & Awmpui',
    tabSos: '24x7 SOS Hmanhmawh',
    postErrand: 'Bid Dawng Turin Dah Rawh',
    addStop: '+ Chawlhna Dah Belh',
    terrainVehicle: 'Motor Lut Theihna',
    terrainSteps: 'Step Thui Kal Ngai (Ke-a Kal Chauh)',
    microInsuranceLabel: 'Rs. 3 Micro-Insurance Dah Tel (Thil Chhia & Chetsualna Vengtu)',
    checkBeforePayTitle: 'En Hmasak Phawt · Check-Before-Pay',
    checkBeforePayDesc:
      'Pek hmain i kawtah en chiang phawt rawh. Duh loh chuan Return Delivery Fee Rs. 45 pek a ngai; hygiene thilte erawh hawn phal a ni lo.',
    workforceTitle: 'In Hnathawk & Company Enkawl Awmpui / Driver',
    sosTitle: '24x7 Emergency Chhanna Rang',
    partnerTitle: 'Partner Console · Tirhkah, Rider & Technician',
    merchantTitle: 'Dawr Neitu · AI Magic Listing & Venhimna',
    adminTitle: 'Operations Command Center',
    devStudioTitle: 'Server Developer Studio & AI Software Engineer',
  },
};
