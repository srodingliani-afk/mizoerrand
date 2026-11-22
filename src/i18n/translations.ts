import type { Language } from '../shared/types';

export const TRANSLATIONS: Record<
  Language,
  {
    brand: string;
    backendBrand: string;
    navCustomer: string;
    navPartner: string;
    navStaff: string;
    navMerchant: string;
    navTechnician: string;
    navApply: string;
    navAdmin: string;
    navDevStudio: string;
    navBackendApi: string;
    navMobileApp: string;
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
    tabProfile: string;
    mobileTabErrands: string;
    mobileTabMarket: string;
    mobileTabStaff: string;
    mobileTabSos: string;
    mobileTabAccount: string;
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
    installAppLabel: string;
    installedStandaloneLabel: string;
    openBackendWebLabel: string;
    backToCustomerLabel: string;
    profileTitle: string;
    profileSubtitle: string;
    switchWorkspaceTitle: string;
  }
> = {
  en: {
    brand: 'ZoRûn',
    backendBrand: 'ZoRûn Backend',
    navCustomer: 'Customer',
    navPartner: 'Partner',
    navStaff: 'Awmpui Staff',
    navMerchant: 'Merchant',
    navTechnician: '24x7 Tech',
    navApply: 'Join / Apply',
    navAdmin: 'Operations',
    navDevStudio: 'Dev Studio',
    navBackendApi: 'Server & API',
    navMobileApp: 'User Mobile App',
    sosCta: '24x7 SOS',
    heroTitle: 'Built for all 11 Mizoram District Capitals, hills & hyperlocal Vengs.',
    heroSubtitle:
      'On-foot Runner for steep Veng stairs, corridor-matched riders, Check-Before-Pay shops, vetted Awmpui staffing, and 24x7 emergency technicians across Aizawl, Lunglei, Champhai, Serchhip, Kolasib, Lawngtlai, Mamit, Siaha, Saitual, Khawzawl & Hnahthial.',
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
    tabProfile: 'App & Account',
    mobileTabErrands: 'Errands',
    mobileTabMarket: 'Market',
    mobileTabStaff: 'Staff',
    mobileTabSos: 'SOS',
    mobileTabAccount: 'App',
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
    partnerTitle: 'Partner Console · Runner, Rider & Shift Technician',
    merchantTitle: 'Merchant Portal · AI Magic Listing & Order Safeguards',
    adminTitle: 'Operations Command Center',
    devStudioTitle: 'Server Developer Studio & AI Software Engineer',
    installAppLabel: 'Install App',
    installedStandaloneLabel: 'Standalone Mobile App Active',
    openBackendWebLabel: 'Backend Web',
    backToCustomerLabel: 'Back to Customer App',
    profileTitle: 'ZoRûn Mobile App & Account',
    profileSubtitle: 'Switch your user workspace, install ZoRûn on your phone home screen, and configure your Mizoram district.',
    switchWorkspaceTitle: 'User App Workspace',
  },
  miz: {
    brand: 'ZoRûn',
    backendBrand: 'ZoRûn Backend',
    navCustomer: 'Customer',
    navPartner: 'Runner / Partner',
    navStaff: 'Awmpui Portal',
    navMerchant: 'Dawr Neitu',
    navTechnician: '24x7 Tech',
    navApply: 'Inziah Luh',
    navAdmin: 'Operations',
    navDevStudio: 'Dev Studio',
    navBackendApi: 'Server & API',
    navMobileApp: 'User Mobile App',
    sosCta: '24x7 SOS',
    heroTitle: 'Mizoram District Khawpui 11 zawng zawng, tlangram leh Veng tin tana siam.',
    heroSubtitle:
      'Aizawl, Lunglei, Champhai, Serchhip, Kolasib, Lawngtlai, Mamit, Siaha, Saitual, Khawzawl & Hnahthial-ah Ke-a kal Runner, rider, En Hmasak Phawt dawr, Awmpui rintlak leh 24x7 emergency technician man inthup awm lo.',
    heroAction: 'Runner Ko Rawh',
    districtLabel: 'District Khawpui',
    allDistrictsLabel: 'District 11 zawng zawng',
    sundayBanner:
      'Pathianni Emergency Mode a nung mek — Dawr pui khar a ni a, 24x7 Rapid Emergency leh thil pawimawh bik erawh hman theih reng a ni.',
    allInclusiveNote: 'Man pumhlum vek · Chhiah leh fee inthup a awm lo',
    tabErrands: 'Runner & Motor',
    tabMarketplace: 'Bazar (En Hmasak)',
    tabWorkforce: 'Hnathawk & Awmpui',
    tabSos: '24x7 SOS Hmanhmawh',
    tabProfile: 'App & Account',
    mobileTabErrands: 'Runner',
    mobileTabMarket: 'Bazar',
    mobileTabStaff: 'Awmpui',
    mobileTabSos: 'SOS',
    mobileTabAccount: 'App',
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
    partnerTitle: 'Partner Console · Runner, Rider & Technician',
    merchantTitle: 'Dawr Neitu · AI Magic Listing & Venhimna',
    adminTitle: 'Operations Command Center',
    devStudioTitle: 'Server Developer Studio & AI Software Engineer',
    installAppLabel: 'App Dah Rawh',
    installedStandaloneLabel: 'Mobile Standalone App a nung mek',
    openBackendWebLabel: 'Backend Web',
    backToCustomerLabel: 'Customer App-ah Let Rawh',
    profileTitle: 'ZoRûn Mobile App & Account',
    profileSubtitle: 'I hman duh mode thlang la, i phone home screen-ah Standalone App angin dah la, District Khawpui thlang rawh.',
    switchWorkspaceTitle: 'User App Hman Dan',
  },
};
