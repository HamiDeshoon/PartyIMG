import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { getValidAccessToken } from './auth.js';

export class CanvaClient {
  private async getAxios(): Promise<AxiosInstance> {
    const token = await getValidAccessToken();
    return axios.create({
      baseURL: 'https://api.canva.com/rest/v1',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Get authenticated user profile
  async getUserProfile() {
    const api = await this.getAxios();
    const response = await api.get('/users/me/profile');
    return response.data;
  }

  // List designs
  async listDesigns(params?: { query?: string; continuation?: string; sort_by?: string }) {
    const api = await this.getAxios();
    const response = await api.get('/designs', { params });
    return response.data;
  }

  // Get single design metadata
  async getDesign(designId: string) {
    const api = await this.getAxios();
    const response = await api.get(`/designs/${designId}`);
    return response.data;
  }

  // Create design
  async createDesign(options: {
    design_type?: { type: 'preset'; name: string } | { type: 'custom'; width: number; height: number };
    asset_id?: string;
    title?: string;
  }) {
    const api = await this.getAxios();
    const response = await api.post('/designs', options);
    return response.data;
  }

  // Export design job creation
  async createExportJob(designId: string, formatOptions: any) {
    const api = await this.getAxios();
    const response = await api.post('/exports', {
      design_id: designId,
      format: formatOptions
    });
    return response.data;
  }

  // Get export job status
  async getExportStatus(exportId: string) {
    const api = await this.getAxios();
    const response = await api.get(`/exports/${exportId}`);
    return response.data;
  }

  // Helper to export and poll until finished
  async exportDesign(designId: string, formatType: 'pdf' | 'png' | 'jpg' | 'mp4' | 'gif' | 'pptx', additionalFormatOpts: any = {}) {
    const format = { type: formatType, ...additionalFormatOpts };
    const job = await this.createExportJob(designId, format);
    const exportId = job.export.id;

    // Poll up to 60 seconds
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await this.getExportStatus(exportId);
      if (statusRes.export.status === 'completed') {
        return statusRes.export;
      } else if (statusRes.export.status === 'failed') {
        throw new Error(`Canva Export Failed: ${JSON.stringify(statusRes.export.error || 'Unknown error')}`);
      }
    }

    throw new Error('Canva Export timed out after 60 seconds.');
  }

  // Upload Asset
  async uploadAsset(filePath: string, title?: string) {
    const api = await this.getAxios();
    const fileName = title || path.basename(filePath);
    const metadata = JSON.stringify({ name: fileName });
    const metadataBase64 = Buffer.from(metadata).toString('base64');

    const fileStream = fs.readFileSync(filePath);

    const response = await api.post('/asset-uploads', fileStream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Asset-Upload-Metadata': metadataBase64
      }
    });

    const uploadId = response.data.job.id;

    // Poll status
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await api.get(`/asset-uploads/${uploadId}`);
      if (statusRes.data.job.status === 'success') {
        return statusRes.data.job.asset;
      } else if (statusRes.data.job.status === 'failed') {
        throw new Error(`Canva Asset Upload Failed: ${JSON.stringify(statusRes.data.job.error)}`);
      }
    }

    throw new Error('Canva Asset Upload timed out.');
  }

  // Get asset details
  async getAsset(assetId: string) {
    const api = await this.getAxios();
    const response = await api.get(`/assets/${assetId}`);
    return response.data;
  }

  // Delete asset
  async deleteAsset(assetId: string) {
    const api = await this.getAxios();
    const response = await api.delete(`/assets/${assetId}`);
    return response.data;
  }

  // Create Autofill job
  async createAutofillJob(brandTemplateId: string, data: Record<string, any>, title?: string) {
    const api = await this.getAxios();
    const response = await api.post('/autofills', {
      brand_template_id: brandTemplateId,
      title: title,
      data: data
    });
    return response.data;
  }

  // Get Autofill job status
  async getAutofillStatus(autofillId: string) {
    const api = await this.getAxios();
    const response = await api.get(`/autofills/${autofillId}`);
    return response.data;
  }

  // Poll autofill design creation
  async autofillDesign(brandTemplateId: string, data: Record<string, any>, title?: string) {
    const job = await this.createAutofillJob(brandTemplateId, data, title);
    const autofillId = job.job.id;

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await this.getAutofillStatus(autofillId);
      if (statusRes.job.status === 'success') {
        return statusRes.job.result;
      } else if (statusRes.job.status === 'failed') {
        throw new Error(`Canva Autofill Failed: ${JSON.stringify(statusRes.job.error)}`);
      }
    }

    throw new Error('Canva Autofill timed out.');
  }

  // List folder items
  async listFolderItems(folderId: string) {
    const api = await this.getAxios();
    const response = await api.get(`/folders/${folderId}/items`);
    return response.data;
  }
}
