import type { LatLng, MizoramDistrict } from '../shared/types';

export interface DistrictVengPoint extends LatLng {
  name: string;
  elevationM: number;
  district: MizoramDistrict;
  zone: string;
  isHub?: boolean;
}

export interface MizoramDistrictCapital {
  district: MizoramDistrict;
  rtoCode: string;
  elevationM: number;
  center: LatLng;
  corridorNoteEn: string;
  corridorNoteMiz: string;
  vengs: DistrictVengPoint[];
}

type VengSeed = [
  name: string,
  label: string,
  dLat: number,
  dLng: number,
  elevationM: number,
  zone: string,
  isHub?: boolean
];

function buildDistrictVengs(
  district: MizoramDistrict,
  baseLat: number,
  baseLng: number,
  seeds: VengSeed[]
): DistrictVengPoint[] {
  return seeds.map(([name, label, dLat, dLng, elevationM, zone, isHub]) => ({
    name,
    label,
    lat: Number((baseLat + dLat).toFixed(4)),
    lng: Number((baseLng + dLng).toFixed(4)),
    elevationM,
    district,
    zone,
    isHub: Boolean(isHub),
  }));
}

export const MIZORAM_DISTRICTS: MizoramDistrictCapital[] = [
  {
    district: 'Aizawl',
    rtoCode: 'MZ-01',
    elevationM: 1132,
    center: { lat: 23.7295, lng: 92.7176, label: 'Aizawl Capital Hub' },
    corridorNoteEn: 'All 84+ AMC Local Councils & Lengpui corridor across North, Central, South, East & West Aizawl',
    corridorNoteMiz: 'Aizawl Local Council Veng zawng zawng (84+) leh Lengpui kawng',
    vengs: buildDistrictVengs('Aizawl', 23.7295, 92.7176, [
      // Core Hub Vengs (exact coordinates preserved)
      ['Dawrpui', 'Dawrpui Bazaar', -0.0024, 0.0, 1085, 'Central', true],
      ['Chanmari', 'Chanmari Traffic Point', 0.007, 0.0014, 1120, 'North', true],
      ['Zarkawt', 'Zarkawt Main Road', 0.0016, 0.0008, 1104, 'Central', true],
      ['Khatla', 'Khatla Secretariat', -0.0054, -0.0042, 1042, 'West', true],
      ['Mission Veng', 'Mission Veng Steps', -0.0091, -0.0018, 995, 'South', true],
      ['Bawngkawn', 'Bawngkawn Junction', 0.019, 0.0078, 1158, 'North', true],
      ['Vaivakawn', 'Vaivakawn Zero Point', 0.0056, -0.0104, 960, 'West', true],
      ['Kulikawn', 'Kulikawn Hospital', -0.014, -0.0008, 1030, 'South', true],
      ['Chaltlang', 'Chaltlang Ridge', 0.0134, 0.0052, 1185, 'North', true],
      ['Republic Veng', 'Republic Veng Slope', -0.0103, 0.0043, 1015, 'South', true],
      // Complete Aizawl Municipal Local Councils & Suburban Hubs (Alphabetical)
      ['Ainawn Veng', 'Ainawn Veng Hillside', -0.0125, -0.0038, 1008, 'South'],
      ['Aizawl Venglai', 'Aizawl Venglai', -0.0038, 0.0025, 1065, 'Central'],
      ['Arm Veng', 'Arm Veng Steps', -0.0045, 0.0068, 980, 'East'],
      ['Arm Veng South', 'Arm Veng South Slope', -0.0072, 0.0074, 965, 'East'],
      ['Bawngkawn South', 'Bawngkawn South', 0.0162, 0.0062, 1140, 'North'],
      ['Bethlehem Veng', 'Bethlehem Veng', -0.0082, 0.0096, 955, 'East'],
      ['Bethlehem Vengthlang', 'Bethlehem Vengthlang', -0.0062, 0.0112, 995, 'East'],
      ['Bungkawn', 'Bungkawn Ridge', -0.004, -0.0068, 1020, 'West'],
      ['Bungkawn Vengthar', 'Bungkawn Vengthar', -0.0028, -0.0084, 990, 'West'],
      ['Chaltlang Lily Veng', 'Chaltlang Lily Veng', 0.0118, 0.0036, 1165, 'North'],
      ['Chanmari West', 'Chanmari West', 0.0064, -0.0034, 1060, 'West'],
      ['Chawnpui', 'Chawnpui Veng', 0.0042, -0.0136, 935, 'West'],
      ['Chhinga Veng', 'Chhinga Veng Bazaar', -0.0012, 0.0046, 1055, 'Central'],
      ['Chite', 'Chite Valley Road', -0.0052, 0.0175, 810, 'East'],
      ['College Veng', 'College Veng Steps', -0.0114, 0.0068, 995, 'South'],
      ['Dam Veng', 'Dam Veng Slope', -0.0085, -0.0048, 985, 'South'],
      ['Dawrpui Vengthar', 'Dawrpui Vengthar', -0.0018, -0.0042, 1035, 'West'],
      ['Dinthar', 'Dinthar Veng', 0.0012, -0.0048, 1030, 'West'],
      ['Durtlang', 'Durtlang Hospital Ridge', 0.0365, 0.0108, 1345, 'North', true],
      ['Durtlang Leitan', 'Durtlang Leitan', 0.0285, 0.0088, 1275, 'North'],
      ['Durtlang North', 'Durtlang North', 0.0425, 0.0114, 1360, 'North'],
      ['Edenthar', 'Edenthar Veng', 0.0088, -0.0012, 1088, 'North'],
      ['Electric Veng', 'Electric Veng Ridge', 0.0024, 0.0042, 1072, 'Central'],
      ['Falkland', 'Falkland Park Ridge', -0.0185, 0.0165, 985, 'East'],
      ['Government Complex', 'Aizawl Govt. Complex', 0.0095, -0.0178, 910, 'West'],
      ['Hlimen', 'Hlimen Quarry Road', -0.0295, -0.0055, 920, 'South'],
      ['Hunthar', 'Hunthar Veng Slope', 0.0035, -0.0088, 975, 'West'],
      ['ITI Veng', 'ITI Veng Complex', -0.0138, 0.0115, 970, 'East'],
      ['Kanan', 'Kanan Veng', 0.0052, -0.0068, 1015, 'West'],
      ['Khatla East', 'Khatla East', -0.0062, -0.0016, 1035, 'Central'],
      ['Khatla South', 'Khatla South', -0.0078, -0.0038, 1015, 'South'],
      ['Laipuitlang', 'Laipuitlang Ridge', 0.0098, 0.0038, 1175, 'North'],
      ['Lawipu', 'Lawipu Slope', -0.0168, -0.0095, 945, 'South'],
      ['Lengpui', 'Lengpui Airport Terminal', 0.1112, -0.0974, 415, 'West', true],
      ['Luangmual', 'Luangmual Veng', 0.0072, -0.0195, 895, 'West'],
      ['Lungverh', 'Lungverh Hillside', -0.0195, -0.0145, 910, 'South'],
      ['Maubawk', 'Maubawk Slope', -0.0048, -0.0098, 965, 'West'],
      ['Melthum', 'Melthum South', -0.0365, -0.0062, 905, 'South'],
      ['Mission Vengthlang', 'Mission Vengthlang', -0.0118, -0.0005, 1020, 'South'],
      ['Model Veng', 'Model Veng', -0.0092, 0.0022, 1025, 'South'],
      ['Mualpui', 'Mualpui Salem Road', -0.0175, 0.0095, 985, 'East'],
      ['Muanna Veng', 'Muanna Veng', 0.0175, 0.0145, 1060, 'East'],
      ['Nursery Veng', 'Nursery Veng', -0.0068, -0.0072, 995, 'West'],
      ['P&E Veng', 'P&E Veng Quarters', -0.0042, 0.0012, 1068, 'Central'],
      ['Phunchawng', 'Phunchawng NH-44A', 0.0128, -0.0265, 790, 'West'],
      ['Ramhlun North', 'Ramhlun North', 0.0138, 0.0082, 1135, 'North'],
      ['Ramhlun South', 'Ramhlun South', 0.0084, 0.0072, 1095, 'North'],
      ['Ramhlun Sport Complex', 'Ramhlun Sports Complex', 0.0108, 0.0104, 1085, 'East'],
      ['Ramhlun Venglai', 'Ramhlun Venglai', 0.0112, 0.0068, 1118, 'North'],
      ['Ramhlun Vengthar', 'Ramhlun Vengthar', 0.0096, 0.0088, 1090, 'East'],
      ['Ramthar North', 'Ramthar North', 0.0062, 0.0074, 1055, 'East'],
      ['Ramthar Veng', 'Ramthar Veng', 0.0038, 0.0082, 1040, 'East'],
      ['Rangvamual', 'Rangvamual NH-44A', 0.0105, -0.0225, 830, 'West'],
      ['Republic Vengthlang', 'Republic Vengthlang', -0.0125, 0.0062, 1005, 'South'],
      ['Rulpui', 'Rulpui Slope', -0.0215, 0.0025, 960, 'South'],
      ['Sakawrtuichhun', 'Sakawrtuichhun Valley', 0.0175, -0.0185, 865, 'West'],
      ['Salem Veng', 'Salem Veng', -0.0148, 0.0052, 990, 'South'],
      ['Saron Veng', 'Saron Veng Steps', -0.0004, 0.0036, 1060, 'Central'],
      ['Selesih', 'Selesih CAU Ridge', 0.0545, 0.0155, 1310, 'North'],
      ['Sihphir', 'Sihphir Town Hub', 0.0885, 0.0224, 1280, 'North'],
      ['Sihphir Venghlun', 'Sihphir Venghlun', 0.0842, 0.0205, 1265, 'North'],
      ['Tanhril', 'Tanhril MZU Campus', -0.0065, -0.0442, 875, 'West', true],
      ['Tlangnuam', 'Tlangnuam Hilltop', -0.0204, -0.0028, 1080, 'South'],
      ['Tlangnuam Vengthar', 'Tlangnuam Vengthar', -0.0235, -0.0042, 1040, 'South'],
      ['Thuampui', 'Thuampui Helipad Junction', 0.0198, 0.0182, 1075, 'East'],
      ['Tuikual North', 'Tuikual North', -0.0005, -0.0025, 1058, 'Central'],
      ['Tuikual South', 'Tuikual South', -0.0026, -0.0022, 1048, 'Central'],
      ['Tuirial', 'Tuirial Airfield Valley', 0.0115, 0.0685, 580, 'East'],
      ['Tuithiang', 'Tuithiang Slope', -0.0032, 0.0062, 1020, 'East'],
      ['Tuivamit', 'Tuivamit Ridge', 0.0142, -0.0138, 950, 'West'],
      ['Upper Republic', 'Upper Republic Ridge', -0.0085, 0.0038, 1035, 'South'],
      ['Venghlui', 'Venghlui Steps', -0.0062, 0.0018, 1038, 'Central'],
      ['Venghnuai', 'Venghnuai Valley', -0.0142, 0.0018, 972, 'South'],
      ['Zemabawk', 'Zemabawk Eastern Hub', 0.0165, 0.0265, 985, 'East', true],
      ['Zemabawk North', 'Zemabawk North', 0.0215, 0.0242, 1015, 'East'],
      ['Zonuam', 'Zonuam Hillside', 0.0022, -0.0165, 915, 'West'],
      ['Zotlang', 'Aizawl Zotlang', 0.0045, -0.0072, 1010, 'West'],
      ['Zuangkawn', 'Zuangkawn Valley', 0.0155, -0.0095, 965, 'North'],
    ]),
  },
  {
    district: 'Lunglei',
    rtoCode: 'MZ-02',
    elevationM: 1222,
    center: { lat: 22.8886, lng: 92.7393, label: 'Lunglei Bazar Hub' },
    corridorNoteEn: 'All 26 LMC Vengs: Chanmari–Bazar–Venglai–Serkawn–Zotlang–Zobawk',
    corridorNoteMiz: 'Lunglei Municipal Veng zawng zawng (26): Chanmari–Bazar–Serkawn–Zobawk',
    vengs: buildDistrictVengs('Lunglei', 22.8886, 92.7393, [
      ['Bazar Veng (Lunglei)', 'Lunglei Bazar Veng', 0.0, 0.0, 1210, 'Central', true],
      ['Chanmari (Lunglei)', 'Lunglei Chanmari', 0.0049, 0.0035, 1235, 'North', true],
      ['Venglai (Lunglei)', 'Lunglei Venglai', -0.0044, -0.0035, 1180, 'Central', true],
      ['Electric Veng (Lunglei)', 'Lunglei Electric Veng', -0.0081, -0.0078, 1140, 'South', true],
      ['Serkawn', 'Serkawn Christian Hospital', 0.0155, 0.0119, 1248, 'North', true],
      ['Zotlang (Lunglei)', 'Zotlang Campus Ridge', 0.0239, 0.0187, 1265, 'North', true],
      ['College Veng (Lunglei)', 'Lunglei College Veng', 0.0115, 0.0075, 1220, 'North'],
      ['Farm Veng', 'Lunglei Farm Veng', -0.0115, 0.0042, 1155, 'South'],
      ['Hauruang', 'Hauruang Village Road', 0.0315, -0.0185, 1090, 'North'],
      ['Hrangchalkawn', 'Hrangchalkawn Junction', -0.0185, 0.0215, 1185, 'East', true],
      ['Kikawn', 'Lunglei Kikawn', -0.0022, 0.0028, 1195, 'Central'],
      ['Luangmual (Lunglei)', 'Lunglei Luangmual', -0.0145, -0.0112, 1125, 'South'],
      ['Lunglawn', 'Lunglawn Ridge', -0.0162, 0.0085, 1190, 'South'],
      ['Lungpuizawl', 'Lungpuizawl Hillside', 0.0192, -0.0085, 1170, 'North'],
      ['Phaileng (Lunglei)', 'Lunglei Phaileng', -0.0095, -0.0142, 1105, 'West'],
      ['Pukpui', 'Pukpui Ridge', 0.0265, 0.0125, 1250, 'North'],
      ['Rahsi Veng', 'Rahsi Veng Steps', -0.0018, -0.0052, 1175, 'West'],
      ['Ramthar (Lunglei)', 'Lunglei Ramthar', 0.0032, -0.0045, 1188, 'West'],
      ['Salem Veng (Lunglei)', 'Lunglei Salem Veng', -0.0064, 0.0058, 1172, 'East'],
      ['Sazaikawn', 'Sazaikawn', 0.0072, 0.0095, 1205, 'East'],
      ['Sethlun', 'Sethlun Valley', -0.0135, 0.0165, 1140, 'East'],
      ['Theiriat', 'Theiriat Ridge', -0.0225, 0.0145, 1165, 'South'],
      ['Venghlun (Lunglei)', 'Lunglei Venghlun', -0.0035, 0.0044, 1185, 'Central'],
      ['Vengthar (Lunglei)', 'Lunglei Vengthar', 0.0018, 0.0062, 1198, 'East'],
      ['Zobawk', 'Zobawk Southern Hub', -0.0325, 0.0185, 1150, 'South', true],
      ['Zohnuai', 'Zohnuai Valley', 0.0128, -0.0062, 1145, 'West'],
    ]),
  },
  {
    district: 'Champhai',
    rtoCode: 'MZ-04',
    elevationM: 1678,
    center: { lat: 23.4744, lng: 93.3292, label: 'Champhai Vengthlang Hub' },
    corridorNoteEn: 'All 22 Champhai Vengs & Zokhawthar border corridor',
    corridorNoteMiz: 'Champhai Veng zawng zawng (22): Vengthlang, Kahrawt, Kanan, Zotlang leh Zote',
    vengs: buildDistrictVengs('Champhai', 23.4744, 93.3292, [
      ['Vengthlang (Champhai)', 'Champhai Vengthlang', 0.0, 0.0, 1678, 'Central', true],
      ['Kahrawt', 'Kahrawt Bazar', -0.0046, -0.0036, 1650, 'Central', true],
      ['Kanan Veng (Champhai)', 'Champhai Kanan Veng', 0.0048, 0.0032, 1690, 'North', true],
      ['Bethel Veng (Champhai)', 'Champhai Bethel Veng', -0.0089, 0.0066, 1615, 'South', true],
      ['Zotlang (Champhai)', 'Champhai Zotlang', 0.0108, -0.0077, 1590, 'West', true],
      ['Chhungte', 'Chhungte Ridge', 0.0145, 0.0085, 1640, 'North'],
      ['Dinthar (Champhai)', 'Champhai Dinthar', -0.0025, -0.0065, 1630, 'West'],
      ['Electric Veng (Champhai)', 'Champhai Electric Veng', -0.0062, 0.0018, 1645, 'Central'],
      ['Hmunhmeltha', 'Hmunhmeltha Road', 0.0185, -0.0112, 1560, 'North'],
      ['Hospital Veng (Champhai)', 'Champhai Hospital Veng', 0.0028, 0.0052, 1670, 'East'],
      ['Jail Veng (Champhai)', 'Champhai Jail Veng', 0.0068, -0.0028, 1665, 'North'],
      ['Keifangtlang', 'Keifangtlang Ridge', 0.0035, -0.0095, 1610, 'West'],
      ['Mualkawi', 'Mualkawi Valley', -0.0185, 0.0145, 1510, 'East'],
      ['New Champhai', 'New Champhai Hub', -0.0115, 0.0115, 1580, 'East', true],
      ['Ruantlang', 'Ruantlang Valley Edge', -0.0145, -0.0125, 1525, 'South'],
      ['Tlangsam', 'Tlangsam Highway', -0.0092, 0.0185, 1550, 'East'],
      ['Tuipui', 'Tuipui Crossing', -0.0225, -0.0065, 1480, 'South'],
      ['Venglai (Champhai)', 'Champhai Venglai', -0.0018, 0.0022, 1668, 'Central'],
      ['Vengthar (Champhai)', 'Champhai Vengthar', 0.0055, 0.0078, 1655, 'East'],
      ['Vengthlang North', 'Champhai Vengthlang North', 0.0024, -0.0012, 1685, 'North'],
      ['Zote', 'Zote Border Road', -0.0165, 0.0225, 1545, 'East', true],
      ['Zokhawthar Road', 'Melbuk / Zokhawthar Corridor', -0.0125, 0.0285, 1495, 'East'],
    ]),
  },
  {
    district: 'Serchhip',
    rtoCode: 'MZ-06',
    elevationM: 1120,
    center: { lat: 23.3106, lng: 92.8492, label: 'Serchhip Bazar Hub' },
    corridorNoteEn: 'All 19 Serchhip Vengs & Chhiahtlang–New Serchhip NH-54 spine',
    corridorNoteMiz: 'Serchhip Veng zawng zawng (19): Chanmari, Bazar, New Serchhip leh Chhiahtlang',
    vengs: buildDistrictVengs('Serchhip', 23.3106, 92.8492, [
      ['Bazar Veng (Serchhip)', 'Serchhip Bazar Veng', 0.0, 0.0, 1120, 'Central', true],
      ['Chanmari (Serchhip)', 'Serchhip Chanmari', 0.0048, -0.0027, 1145, 'North', true],
      ['New Serchhip', 'New Serchhip Junction', -0.0068, 0.0036, 1090, 'South', true],
      ['P&E Veng (Serchhip)', 'Serchhip P&E Veng', -0.0031, -0.0052, 1105, 'West', true],
      ['Chhiahtlang', 'Chhiahtlang Ridge', 0.0359, 0.0096, 1190, 'North', true],
      ['Chhim Veng (Serchhip)', 'Serchhip Chhim Veng', -0.0088, -0.0018, 1085, 'South'],
      ['Dinthar (Serchhip)', 'Serchhip Dinthar', 0.0022, 0.0042, 1128, 'East'],
      ['Field Veng (Serchhip)', 'Serchhip Field Veng', -0.0015, 0.0028, 1115, 'Central'],
      ['Hmar Veng (Serchhip)', 'Serchhip Hmar Veng', 0.0065, 0.0012, 1152, 'North'],
      ['Kikawn (Serchhip)', 'Serchhip Kikawn', 0.0018, -0.0035, 1118, 'West'],
      ['Leisang Veng', 'Serchhip Leisang Veng', -0.0048, 0.0062, 1098, 'East'],
      ['New Serchhip North', 'New Serchhip North', -0.0042, 0.0022, 1102, 'South'],
      ['Ramthlun Veng', 'Serchhip Ramthlun Veng', 0.0082, 0.0048, 1140, 'North'],
      ['Sailiamkawn', 'Sailiamkawn Junction', 0.0115, -0.0042, 1160, 'North'],
      ['Saron Veng (Serchhip)', 'Serchhip Saron Veng', -0.0022, -0.0024, 1112, 'Central'],
      ['Tuikhuah Veng', 'Serchhip Tuikhuah Veng', 0.0032, -0.0068, 1095, 'West'],
      ['Vengchung (Serchhip)', 'Serchhip Vengchung', 0.0038, 0.0018, 1138, 'Central', true],
      ['Venglai (Serchhip)', 'Serchhip Venglai', -0.0012, 0.001, 1118, 'Central'],
      ['Zion Veng (Serchhip)', 'Serchhip Zion Veng', -0.0105, 0.0052, 1075, 'South'],
    ]),
  },
  {
    district: 'Kolasib',
    rtoCode: 'MZ-05',
    elevationM: 888,
    center: { lat: 24.2256, lng: 92.6774, label: 'Kolasib Diakkawn Hub' },
    corridorNoteEn: 'All 19 Kolasib Vengs & NH-306 Thingdawl–Diakkawn–Vairengte gateway',
    corridorNoteMiz: 'Kolasib Veng zawng zawng (19): Diakkawn, Venglai, Project Veng leh Thingdawl',
    vengs: buildDistrictVengs('Kolasib', 24.2256, 92.6774, [
      ['Diakkawn', 'Kolasib Diakkawn', 0.0, 0.0, 888, 'Central', true],
      ['Venglai (Kolasib)', 'Kolasib Venglai', -0.0038, 0.0024, 870, 'Central', true],
      ['Project Veng (Kolasib)', 'Kolasib Project Veng', 0.0056, -0.0034, 910, 'North', true],
      ['Tumpui', 'Kolasib Tumpui', -0.0082, 0.0061, 845, 'South', true],
      ['College Veng (Kolasib)', 'Kolasib College Veng', 0.0104, -0.0062, 925, 'North', true],
      ['Bangla Veng', 'Kolasib Bangla Veng', -0.0022, -0.0038, 878, 'West'],
      ['Bazar Veng (Kolasib)', 'Kolasib Bazar Veng', -0.0012, 0.0014, 882, 'Central'],
      ['Electric Veng (Kolasib)', 'Kolasib Electric Veng', -0.0048, -0.0024, 862, 'West'],
      ['Gosen Veng', 'Kolasib Gosen Veng', 0.0038, 0.0058, 895, 'East'],
      ['Hmar Veng (Kolasib)', 'Kolasib Hmar Veng', 0.0085, 0.0018, 915, 'North'],
      ['Khuangpuilam', 'Khuangpuilam NH-306', 0.0155, -0.0085, 840, 'North'],
      ['New Diakkawn', 'New Diakkawn', 0.0026, -0.0025, 892, 'Central'],
      ['Pangbalkawn', 'Pangbalkawn Corridor', 0.0225, -0.0115, 810, 'North'],
      ['Rengtekawn', 'Kolasib Rengtekawn', -0.0118, -0.0045, 855, 'South'],
      ['Saiden', 'Saiden Village', 0.0132, 0.0088, 865, 'East'],
      ['Salem Veng (Kolasib)', 'Kolasib Salem Veng', -0.0062, 0.0035, 860, 'South'],
      ['Thingdawl', 'Thingdawl NH-306 Hub', -0.0285, 0.0095, 895, 'South', true],
      ['Vengthar (Kolasib)', 'Kolasib Vengthar', 0.0042, 0.0036, 898, 'East'],
      ['Zion Veng (Kolasib)', 'Kolasib Zion Veng', -0.0095, -0.0012, 850, 'South'],
    ]),
  },
  {
    district: 'Lawngtlai',
    rtoCode: 'MZ-07',
    elevationM: 760,
    center: { lat: 22.5284, lng: 92.8939, label: 'Lawngtlai Bazar Hub' },
    corridorNoteEn: 'All 16 Lawngtlai LADC Vengs: Bazar Veng–Chandmary–AOC–Council Veng',
    corridorNoteMiz: 'Lawngtlai Veng zawng zawng (16): Bazar Veng, Chandmary, AOC leh Council Veng',
    vengs: buildDistrictVengs('Lawngtlai', 22.5284, 92.8939, [
      ['Bazar Veng (Lawngtlai)', 'Lawngtlai Bazar Veng', 0.0, 0.0, 760, 'Central', true],
      ['Chandmary (Lawngtlai)', 'Lawngtlai Chandmary', 0.0046, -0.0029, 790, 'North', true],
      ['AOC Veng (Lawngtlai)', 'Lawngtlai AOC Veng', -0.0039, 0.0041, 735, 'East', true],
      ['Council Veng (Lawngtlai)', 'Lawngtlai Council Veng', 0.0081, 0.0023, 810, 'North', true],
      ['Electric Veng (Lawngtlai)', 'Lawngtlai Electric Veng', -0.0074, -0.0037, 720, 'South', true],
      ['Bethel Veng (Lawngtlai)', 'Lawngtlai Bethel Veng', -0.0052, 0.0068, 745, 'East'],
      ['College Veng (Lawngtlai)', 'Lawngtlai College Veng', 0.0098, -0.0048, 825, 'North'],
      ['Lawngtlai III', 'Lawngtlai-III Veng', -0.0025, -0.0048, 748, 'West'],
      ['Lawngtlai IV', 'Lawngtlai-IV Veng', -0.0058, -0.0072, 730, 'West'],
      ['New Lawngtlai', 'New Lawngtlai', 0.0062, 0.0058, 785, 'East'],
      ['Rengkashya', 'Rengkashya Slope', -0.0115, 0.0028, 710, 'South'],
      ['Salem Veng (Lawngtlai)', 'Lawngtlai Salem Veng', 0.0024, 0.0034, 772, 'East'],
      ['Thingkah', 'Thingkah Valley', -0.0145, -0.0065, 690, 'South'],
      ['Vengpui (Lawngtlai)', 'Lawngtlai Vengpui', 0.0018, -0.0018, 768, 'Central', true],
      ['Vengthar (Lawngtlai)', 'Lawngtlai Vengthar', -0.0088, 0.0052, 725, 'South'],
      ['Zion Veng (Lawngtlai)', 'Lawngtlai Zion Veng', 0.0052, -0.0065, 775, 'West'],
    ]),
  },
  {
    district: 'Mamit',
    rtoCode: 'MZ-08',
    elevationM: 718,
    center: { lat: 23.9288, lng: 92.4906, label: 'Mamit Bazar Hub' },
    corridorNoteEn: 'All 14 Mamit Vengs: Bazar Veng–Chhim Veng–Hmar Veng–Luangpawl',
    corridorNoteMiz: 'Mamit Veng zawng zawng (14): Bazar Veng, Chhim Veng, Hmar Veng leh Luangpawl',
    vengs: buildDistrictVengs('Mamit', 23.9288, 92.4906, [
      ['Bazar Veng (Mamit)', 'Mamit Bazar Veng', 0.0, 0.0, 718, 'Central', true],
      ['Chhim Veng (Mamit)', 'Mamit Chhim Veng', -0.0053, 0.0012, 705, 'South', true],
      ['Hmar Veng (Mamit)', 'Mamit Hmar Veng', 0.0052, -0.0018, 742, 'North', true],
      ['Luangpawl', 'Mamit Luangpawl', -0.0033, -0.0064, 685, 'West', true],
      ['Venghlun (Mamit)', 'Mamit Venghlun', 0.0024, 0.0056, 730, 'East', true],
      ['College Veng (Mamit)', 'Mamit College Veng', 0.0082, 0.0032, 755, 'North'],
      ['Dinthar (Mamit)', 'Mamit Dinthar', -0.0022, 0.0038, 712, 'East'],
      ['Field Veng (Mamit)', 'Mamit Field Veng', 0.0015, -0.0028, 720, 'Central'],
      ['Hospital Veng (Mamit)', 'Mamit Hospital Veng', 0.0042, 0.0044, 738, 'North'],
      ['Lungkawn', 'Lungkawn Slope', -0.0095, -0.0042, 675, 'South'],
      ['New Mamit', 'New Mamit Complex', 0.0108, -0.0055, 760, 'North', true],
      ['P&E Veng (Mamit)', 'Mamit P&E Veng', -0.0041, -0.0022, 702, 'West'],
      ['Suarhliap', 'Suarhliap Road', -0.0125, 0.0065, 665, 'South'],
      ['Venglai (Mamit)', 'Mamit Venglai', -0.0014, 0.0016, 715, 'Central'],
    ]),
  },
  {
    district: 'Siaha',
    rtoCode: 'MZ-03',
    elevationM: 1120,
    center: { lat: 22.4904, lng: 92.9803, label: 'Siaha New Siaha Hub' },
    corridorNoteEn: 'All 16 Siaha MADC Vengs: New Siaha–Meisatla–Council Veng–Vaihpi',
    corridorNoteMiz: 'Siaha Veng zawng zawng (16): New Siaha, College Veng, Meisatla leh Vaihpi',
    vengs: buildDistrictVengs('Siaha', 22.4904, 92.9803, [
      ['New Siaha', 'New Siaha Bazar', 0.0, 0.0, 1120, 'Central', true],
      ['College Veng (Siaha)', 'Siaha College Veng', 0.0056, -0.0043, 1155, 'North', true],
      ['Meisatla', 'Siaha Meisatla', -0.0052, 0.0042, 1085, 'South', true],
      ['Council Veng (Siaha)', 'Siaha Council Veng', 0.0028, 0.0049, 1135, 'East', true],
      ['Siahatla', 'Siahatla Slope', -0.0084, -0.0028, 1060, 'South', true],
      ['Bazar Veng (Siaha)', 'Siaha Bazar Veng', -0.0015, 0.0015, 1118, 'Central'],
      ['ECM Veng', 'Siaha ECM Veng', 0.0038, 0.0018, 1142, 'North'],
      ['New Colony', 'Siaha New Colony', 0.0018, -0.0035, 1128, 'West'],
      ['New Siaha East', 'New Siaha East', 0.0008, 0.0058, 1110, 'East'],
      ['New Siaha West', 'New Siaha West', -0.0012, -0.0052, 1105, 'West'],
      ['Old Siaha', 'Old Siaha Hub', -0.0115, 0.0012, 1050, 'South', true],
      ['Thosai Veng', 'Siaha Thosai Veng', -0.0065, -0.0065, 1072, 'West'],
      ['Tisi Road', 'Tisi Road Ridge', 0.0085, 0.0062, 1165, 'North'],
      ['Vaihpi I', 'Siaha Vaihpi-I', -0.0038, 0.0022, 1095, 'Central'],
      ['Vaihpi II', 'Siaha Vaihpi-II', -0.0055, 0.0068, 1080, 'East'],
      ['Zion Veng (Siaha)', 'Siaha Zion Veng', 0.0045, -0.0072, 1130, 'West'],
    ]),
  },
  {
    district: 'Saitual',
    rtoCode: 'MZ-09',
    elevationM: 1210,
    center: { lat: 23.6947, lng: 92.9748, label: 'Saitual Bazar Hub' },
    corridorNoteEn: 'All 13 Saitual Vengs & Keifang NH-6 eastern junction',
    corridorNoteMiz: 'Saitual Veng zawng zawng (13): Bazar Veng, Keifang, Thangpui leh Venglai',
    vengs: buildDistrictVengs('Saitual', 23.6947, 92.9748, [
      ['Bazar Veng (Saitual)', 'Saitual Bazar Veng', 0.0, 0.0, 1210, 'Central', true],
      ['Keifang', 'Keifang Junction', -0.0235, -0.0133, 1185, 'South', true],
      ['Thangpui Veng', 'Saitual Thangpui Veng', 0.0048, 0.0042, 1240, 'North', true],
      ['Rulchawm Road', 'Saitual Rulchawm Road', -0.0062, -0.0063, 1170, 'West', true],
      ['Bazar Veng North (Saitual)', 'Saitual Bazar North', 0.0025, -0.0018, 1220, 'North'],
      ['College Veng (Saitual)', 'Saitual College Veng', 0.0068, 0.0024, 1248, 'North'],
      ['Dinthar (Saitual)', 'Saitual Dinthar', -0.0032, 0.0045, 1192, 'East'],
      ['High School Veng (Saitual)', 'Saitual High School Veng', 0.0032, -0.0042, 1215, 'West'],
      ['Hospital Veng (Saitual)', 'Saitual Hospital Veng', -0.0048, 0.0018, 1198, 'South'],
      ['Kanan Veng (Saitual)', 'Saitual Kanan Veng', 0.0014, 0.0056, 1225, 'East'],
      ['Saitual Venglai', 'Saitual Venglai', -0.0018, -0.0024, 1205, 'Central', true],
      ['Saitual Vengthar', 'Saitual Vengthar', -0.0075, 0.0052, 1180, 'South'],
      ['Zokhawthiang', 'Zokhawthiang Slope', 0.0085, -0.0065, 1235, 'North'],
    ]),
  },
  {
    district: 'Khawzawl',
    rtoCode: 'MZ-10',
    elevationM: 1410,
    center: { lat: 23.5335, lng: 93.1846, label: 'Khawzawl Vengthar Hub' },
    corridorNoteEn: 'All 12 Khawzawl Vengs: Vengthar–Hermon–Zaingen–Venglai–Darngawn',
    corridorNoteMiz: 'Khawzawl Veng zawng zawng (12): Vengthar, Hermon, Electric, Zaingen leh Venglai',
    vengs: buildDistrictVengs('Khawzawl', 23.5335, 93.1846, [
      ['Vengthar (Khawzawl)', 'Khawzawl Vengthar', 0.0, 0.0, 1410, 'Central', true],
      ['Hermon Veng', 'Khawzawl Hermon Veng', 0.0047, 0.0034, 1440, 'North', true],
      ['Electric Veng (Khawzawl)', 'Khawzawl Electric Veng', -0.0045, -0.0036, 1385, 'South', true],
      ['Zaingen', 'Khawzawl Zaingen', 0.008, -0.0064, 1425, 'West', true],
      ['Arro Veng', 'Khawzawl Arro Veng', -0.0068, 0.0052, 1375, 'South'],
      ['Bazar Veng (Khawzawl)', 'Khawzawl Bazar Veng', -0.0015, 0.0018, 1405, 'Central', true],
      ['Darngawn', 'Khawzawl Darngawn', 0.0062, -0.0028, 1430, 'North'],
      ['Dinthar (Khawzawl)', 'Khawzawl Dinthar', -0.0028, -0.0055, 1392, 'West'],
      ['Kawnzar', 'Khawzawl Kawnzar', 0.0024, -0.0042, 1418, 'West'],
      ['Lungvar', 'Khawzawl Lungvar', -0.0085, -0.0018, 1365, 'South'],
      ['Venglai (Khawzawl)', 'Khawzawl Venglai', 0.0018, 0.0046, 1415, 'East'],
      ['Zuchhip', 'Khawzawl Zuchhip', 0.0055, 0.0068, 1448, 'East'],
    ]),
  },
  {
    district: 'Hnahthial',
    rtoCode: 'MZ-11',
    elevationM: 945,
    center: { lat: 22.9661, lng: 92.9316, label: 'Hnahthial Bazar Hub' },
    corridorNoteEn: 'All 12 Hnahthial Vengs: Bazar–Electric–Peniel–Chanmari–Tarpho',
    corridorNoteMiz: 'Hnahthial Veng zawng zawng (12): Bazar Veng, Electric, Peniel leh Tarpho',
    vengs: buildDistrictVengs('Hnahthial', 22.9661, 92.9316, [
      ['Bazar Veng (Hnahthial)', 'Hnahthial Bazar Veng', 0.0, 0.0, 945, 'Central', true],
      ['Electric Veng (Hnahthial)', 'Hnahthial Electric Veng', -0.0049, -0.0038, 920, 'South', true],
      ['Peniel Veng', 'Hnahthial Peniel Veng', 0.0054, 0.0038, 970, 'North', true],
      ['Tarpho', 'Hnahthial Tarpho', -0.0076, 0.0056, 895, 'East', true],
      ['Chanmari (Hnahthial)', 'Hnahthial Chanmari', 0.0028, -0.0024, 955, 'North', true],
      ['Chawngtui Road', 'Hnahthial Chawngtui Road', -0.0062, -0.0058, 910, 'West'],
      ['College Veng (Hnahthial)', 'Hnahthial College Veng', 0.0072, -0.0018, 980, 'North'],
      ['Kanan Veng (Hnahthial)', 'Hnahthial Kanan Veng', 0.0015, 0.0042, 952, 'East'],
      ['Lungleng Veng (Hnahthial)', 'Hnahthial Lungleng Veng', -0.0034, 0.0032, 928, 'East'],
      ['Model Veng (Hnahthial)', 'Hnahthial Model Veng', 0.0042, 0.0014, 962, 'North'],
      ['Venglai (Hnahthial)', 'Hnahthial Venglai', -0.0018, -0.0016, 938, 'Central'],
      ['Vengthar (Hnahthial)', 'Hnahthial Vengthar', -0.0088, 0.0018, 905, 'South'],
    ]),
  },
];

export const ALL_MIZORAM_DISTRICT_NAMES: MizoramDistrict[] = MIZORAM_DISTRICTS.map(
  (d) => d.district
);

export const ALL_MIZORAM_VENGS: DistrictVengPoint[] = MIZORAM_DISTRICTS.flatMap(
  (d) => d.vengs
);

export function getDistrictInfo(district: MizoramDistrict): MizoramDistrictCapital {
  return MIZORAM_DISTRICTS.find((d) => d.district === district) || MIZORAM_DISTRICTS[0];
}

export function getVengsForDistrict(district: MizoramDistrict): DistrictVengPoint[] {
  return getDistrictInfo(district).vengs;
}

export function findDistrictVeng(
  district: MizoramDistrict,
  vengName: string
): DistrictVengPoint {
  const vengs = getVengsForDistrict(district);
  return vengs.find((v) => v.name === vengName) || vengs[0];
}

export function findAnyMizoramVeng(vengName: string): DistrictVengPoint {
  for (const d of MIZORAM_DISTRICTS) {
    const found = d.vengs.find((v) => v.name === vengName);
    if (found) return found;
  }
  return MIZORAM_DISTRICTS[0].vengs[0];
}

export function calculateDistanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export interface NearestVengMatch {
  veng: DistrictVengPoint;
  distanceMeters: number;
  isWithinMizoramBounds: boolean;
}

export function findNearestMizoramVeng(
  lat: number,
  lng: number,
  preferredDistrict?: MizoramDistrict
): NearestVengMatch {
  let best: DistrictVengPoint = ALL_MIZORAM_VENGS[0];
  let bestDist = Infinity;

  for (const v of ALL_MIZORAM_VENGS) {
    const d = calculateDistanceMeters({ lat, lng }, v);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }

  // If the user is within Mizoram bounds (~45km of any mapped Veng) and preferredDistrict
  // has a nearly identical match (within 250m), keep preferredDistrict for smooth UX.
  if (preferredDistrict && best.district !== preferredDistrict) {
    const localVengs = getVengsForDistrict(preferredDistrict);
    for (const lv of localVengs) {
      const ld = calculateDistanceMeters({ lat, lng }, lv);
      if (ld <= bestDist + 250 && ld < 25000) {
        best = lv;
        bestDist = ld;
        break;
      }
    }
  }

  const isWithinMizoramBounds =
    lat >= 21.85 && lat <= 24.65 && lng >= 92.15 && lng <= 93.55 && bestDist <= 65000;

  return {
    veng: best,
    distanceMeters: bestDist,
    isWithinMizoramBounds,
  };
}

