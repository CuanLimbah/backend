import type { WasteQuantityUnit, WasteType } from './models';

export function getWasteQuantityUnit(wasteType: WasteType): WasteQuantityUnit {
  return wasteType === 'oil' ? 'liter' : 'kg';
}

export function getWasteQuantityUnitLabel(wasteType: WasteType): string {
  return wasteType === 'oil' ? 'Liter' : 'KG';
}

export function getWasteQuantityLabel(wasteType: WasteType): string {
  return wasteType === 'oil' ? 'Volume' : 'Berat';
}

export function getPricePerUnitLabel(wasteType: WasteType): string {
  return wasteType === 'oil' ? 'Rp/liter' : 'Rp/kg';
}

export function getPriceUnitSuffix(wasteType: WasteType): string {
  return wasteType === 'oil' ? 'liter' : 'kg';
}
