import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  isConfigured(): boolean {
    return Boolean(
      process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
        process.env.CLOUDINARY_API_KEY?.trim() &&
        process.env.CLOUDINARY_API_SECRET?.trim(),
    );
  }

  isDataUrl(value?: string): boolean {
    return Boolean(value && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value));
  }

  async uploadSubmissionImage(
    imageData: string,
    submissionId: string,
  ): Promise<{ publicId: string; secureUrl: string }> {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
      api_key: process.env.CLOUDINARY_API_KEY?.trim(),
      api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
    });

    const result = await cloudinary.uploader.upload(imageData, {
      folder: 'cuanlimbah/submissions',
      public_id: submissionId,
      overwrite: true,
      resource_type: 'image',
    });

    return {
      publicId: result.public_id,
      secureUrl: result.secure_url,
    };
  }
}
