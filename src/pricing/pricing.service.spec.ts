import { PricingService } from './pricing.service';

function mockPriceModel(pricePerKg: number) {
  return {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        waste_type: 'oil',
        price_per_kg: pricePerKg,
      }),
    }),
  };
}

describe('PricingService', () => {
  it('calculates estimates with default grade A', async () => {
    const service = new PricingService(mockPriceModel(3000) as any);

    const result = await service.calculateEstimate({
      wasteType: 'oil',
      weightKg: 10,
      useLatestPrice: true,
    });

    expect(result.qualityGrade).toBe('A');
    expect(result.basePricePerKg).toBe(3000);
    expect(result.finalPricePerKg).toBe(3000);
    expect(result.quantity).toBe(10);
    expect(result.unit).toBe('liter');
    expect(result.basePricePerUnit).toBe(3000);
    expect(result.finalPricePerUnit).toBe(3000);
    expect(result.earnings).toBe(30000);
    expect(result.explanation).toContain('Estimasi cuan');
    expect(result.explanation).toContain('10 Liter minyak jelantah');
    expect(result.explanation).toContain('/liter');
  });

  it('uses kg labels for food pricing explanations', async () => {
    const service = new PricingService(mockPriceModel(1000) as any);

    const result = await service.calculateEstimate({
      wasteType: 'food',
      weightKg: 3,
      qualityGrade: 'A',
      priceSnapshotPerKg: 1000,
    });

    expect(result.unit).toBe('kg');
    expect(result.quantityLabel).toBe('Berat');
    expect(result.explanation).toContain('3 KG limbah makanan');
    expect(result.explanation).toContain('/kg');
    expect(result.weightKg).toBe(3);
    expect(result.basePricePerKg).toBe(1000);
    expect(result.finalPricePerKg).toBe(1000);
  });

  it('uses liter labels for oil pricing explanations', async () => {
    const service = new PricingService(mockPriceModel(3000) as any);

    const result = await service.calculateEstimate({
      wasteType: 'oil',
      weightKg: 3,
      qualityGrade: 'A',
      priceSnapshotPerKg: 3000,
    });

    expect(result.unit).toBe('liter');
    expect(result.quantityLabel).toBe('Volume');
    expect(result.explanation).toContain('3 Liter minyak jelantah');
    expect(result.explanation).toContain('/liter');
    expect(result.weightKg).toBe(3);
    expect(result.basePricePerKg).toBe(3000);
    expect(result.finalPricePerKg).toBe(3000);
    expect(result.quantity).toBe(3);
    expect(result.basePricePerUnit).toBe(3000);
    expect(result.finalPricePerUnit).toBe(3000);
  });

  it.each([
    ['A', 1, 30000],
    ['B', 0.85, 25500],
    ['C', 0.6, 18000],
  ] as const)('calculates oil grade %s', async (qualityGrade, multiplier, earnings) => {
    const service = new PricingService(mockPriceModel(3000) as any);

    const result = await service.calculateFinalPrice({
      wasteType: 'oil',
      weightKg: 10,
      qualityGrade,
      priceSnapshotPerKg: 3000,
    });

    expect(result.qualityMultiplier).toBe(multiplier);
    expect(result.earnings).toBe(earnings);
  });

  it.each([
    ['A', 1, 10000, false],
    ['B', 0.7, 7000, false],
    ['C', 0, 0, true],
  ] as const)(
    'calculates food grade %s',
    async (qualityGrade, multiplier, earnings, zeroPayout) => {
      const service = new PricingService(mockPriceModel(1000) as any);

      const result = await service.calculateFinalPrice({
        wasteType: 'food',
        weightKg: 10,
        qualityGrade,
        priceSnapshotPerKg: 1000,
      });

      expect(result.qualityMultiplier).toBe(multiplier);
      expect(result.earnings).toBe(earnings);
      expect(result.breakdown.zeroPayout).toBe(zeroPayout);
    },
  );

  it('rounds final earnings to integer rupiah', async () => {
    const service = new PricingService(mockPriceModel(3333) as any);

    const result = await service.calculateFinalPrice({
      wasteType: 'oil',
      weightKg: 2.5,
      qualityGrade: 'B',
      priceSnapshotPerKg: 3333,
    });

    expect(result.finalPricePerKg).toBe(2833);
    expect(result.earnings).toBe(7083);
  });
});
