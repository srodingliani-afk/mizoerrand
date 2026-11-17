import {
  MIZORAM_DISTRICTS,
  findDistrictVeng,
  getVengsForDistrict,
  type DistrictVengPoint,
} from './mizoramDistricts';

export type AizawlVengPoint = DistrictVengPoint;

export const AIZAWL_VENGS: DistrictVengPoint[] = getVengsForDistrict('Aizawl');

export const ALL_MIZORAM_VENGS: DistrictVengPoint[] = MIZORAM_DISTRICTS.flatMap((d) => d.vengs);

export function findVengByName(name: string): DistrictVengPoint {
  for (const d of MIZORAM_DISTRICTS) {
    const found = d.vengs.find((v) => v.name === name);
    if (found) return found;
  }
  return findDistrictVeng('Aizawl', name);
}
