import { z } from 'zod';
import { Model } from 'mongoose';
import { DropPointEntity } from '../../database/schemas/drop-point.schema';
import { AgentTool, globalToolRegistry } from './tool.registry';

let dropPointModel: Model<DropPointEntity> | null = null;

export function setDropPointModel(model: Model<DropPointEntity>) {
  dropPointModel = model;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const findDropPointTool: AgentTool = {
  name: 'find_drop_point',
  description:
    'Find waste drop-off points. If the user provides their coordinates, results are sorted by distance. Otherwise returns all available drop points.',
  parameters: z.object({
    latitude: z.number().optional().describe('User latitude for distance sorting'),
    longitude: z.number().optional().describe('User longitude for distance sorting'),
  }),
  execute: async (args: { latitude?: number; longitude?: number }) => {
    if (!dropPointModel) return 'Drop point service is not available.';

    const points = await dropPointModel.find().lean().exec();

    if (points.length === 0) return 'Belum ada drop point yang tersedia.';

    let sorted = points;
    if (args.latitude != null && args.longitude != null) {
      sorted = [...points].sort(
        (a, b) =>
          haversineKm(args.latitude!, args.longitude!, a.latitude, a.longitude) -
          haversineKm(args.latitude!, args.longitude!, b.latitude, b.longitude),
      );
    }

    return sorted
      .map((dp) => {
        let line = `- ${dp.name}: ${dp.address} | ${dp.operating_hours} | ${dp.contact}`;
        if (args.latitude != null && args.longitude != null) {
          const dist = haversineKm(args.latitude!, args.longitude!, dp.latitude, dp.longitude);
          line += ` | ~${dist.toFixed(1)} km`;
        }
        return line;
      })
      .join('\n');
  },
};

globalToolRegistry.registerTool(findDropPointTool);
