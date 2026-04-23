import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class MapsService {
  private readonly googleMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim() || '';

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
    if (!this.googleMapsApiKey) {
      throw new BadRequestException(
        'Google Maps API belum dikonfigurasi. Isi GOOGLE_MAPS_API_KEY di backend.',
      );
    }

    const params = new URLSearchParams({
      address,
      key: this.googleMapsApiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    );

    if (!response.ok) {
      throw new BadRequestException('Google Maps API tidak dapat dihubungi.');
    }

    const data = (await response.json()) as {
      results?: Array<{
        geometry?: {
          location?: {
            lat?: number;
            lng?: number;
          };
        };
      }>;
      status?: string;
      error_message?: string;
    };

    if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
      if (data.status === 'ZERO_RESULTS') {
        throw new NotFoundException('Alamat tidak ditemukan di Google Maps.');
      }

      throw new BadRequestException(
        data.error_message ||
          `Google Maps geocoding gagal dengan status ${data.status ?? 'UNKNOWN'}.`,
      );
    }

    return {
      latitude: data.results[0].geometry.location.lat ?? 0,
      longitude: data.results[0].geometry.location.lng ?? 0,
    };
  }
}
