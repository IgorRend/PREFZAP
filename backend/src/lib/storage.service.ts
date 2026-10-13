/**
 * storage.service.ts
 *
 * Centralized file I/O service with strict tenant path isolation.
 *
 * Path strategy:
 *   /uploads/tenant_{tenantId}/YYYY/MM/{uuid}.{ext}
 *
 * This guarantees:
 *   1. Cross-tenant URL guessing is impossible (opaque UUID filenames)
 *   2. Deleting a tenant's folder wipes ALL their media atomically
 *   3. Month-based sub-folders prevent filesystem inode exhaustion
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ─── Root uploads directory (relative to CWD = backend/) ──────────────────────
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

// ─── MIME → extension map ──────────────────────────────────────────────────────
const MIME_EXT_MAP: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/zip': 'zip',
    'text/plain': 'txt',
};

export class StorageService {
    /**
     * Returns the absolute directory for a tenant's uploads.
     * Pattern: /uploads/tenant_{tenantId}/YYYY/MM/
     */
    static getTenantMonthDir(tenantId: string, date = new Date()): string {
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const dir = path.join(UPLOADS_ROOT, `tenant_${tenantId}`, year, month);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    /**
     * Returns the root folder for a tenant (all years/months).
     * Used for deletion.
     */
    static getTenantRootDir(tenantId: string): string {
        return path.join(UPLOADS_ROOT, `tenant_${tenantId}`);
    }

    /**
     * Save a Buffer (e.g., media downloaded from Zapo) to tenant-scoped storage.
     * Returns the public URL path (e.g., /uploads/tenant_xyz/2025/05/uuid.jpg)
     */
    static async saveBuffer(
        tenantId: string,
        buffer: Buffer,
        mimeType: string,
        originalFilename?: string,
    ): Promise<string> {
        const ext = MIME_EXT_MAP[mimeType] ??
            (originalFilename ? path.extname(originalFilename).replace('.', '') : 'bin');

        const filename = `${uuidv4()}.${ext}`;
        const dir = this.getTenantMonthDir(tenantId);
        const absolutePath = path.join(dir, filename);

        await fs.promises.writeFile(absolutePath, buffer);

        // Return relative URL path (served statically by Express)
        return absolutePath
            .replace(path.resolve(process.cwd()), '')
            .replace(/\\/g, '/');
    }

    /**
     * Save a base64-encoded string (e.g., from Zapo media payloads).
     * Returns the public URL path.
     */
    static async saveBase64(
        tenantId: string,
        base64Data: string,
        mimeType: string,
    ): Promise<string> {
        // Strip data URI prefix if present (data:image/jpeg;base64,...)
        const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(raw, 'base64');
        return this.saveBuffer(tenantId, buffer, mimeType);
    }

    /**
     * Save a file from an Express multer upload (req.file) to tenant-scoped storage.
     * Returns the public URL path.
     */
    static async saveMullerFile(
        tenantId: string,
        file: Express.Multer.File,
    ): Promise<string> {
        const ext = MIME_EXT_MAP[file.mimetype] ??
            path.extname(file.originalname).replace('.', '') ?? 'bin';

        const filename = `${uuidv4()}.${ext}`;
        const dir = this.getTenantMonthDir(tenantId);
        const absolutePath = path.join(dir, filename);

        if (file.buffer) {
            // Memory storage
            await fs.promises.writeFile(absolutePath, file.buffer);
        } else if (file.path) {
            // Disk storage — move temp file
            await fs.promises.rename(file.path, absolutePath);
        } else {
            throw new Error('Multer file has no buffer or path');
        }

        return absolutePath
            .replace(path.resolve(process.cwd()), '')
            .replace(/\\/g, '/');
    }

    /**
     * Download a remote URL and save it to tenant-scoped storage.
     * Used by the Zapo webhook handler to store incoming media.
     * Returns the public URL path.
     */
    static async downloadAndSave(
        tenantId: string,
        remoteUrl: string,
        mimeType: string,
    ): Promise<string> {
        const { default: axios } = await import('axios');
        const response = await axios.get(remoteUrl, {
            responseType: 'arraybuffer',
            timeout: 30_000,
            maxContentLength: 50 * 1024 * 1024, // 50MB max
        });
        const buffer = Buffer.from(response.data);
        const contentType = response.headers['content-type'] as string || mimeType;
        return this.saveBuffer(tenantId, buffer, contentType);
    }

    /**
     * Delete ALL files and folders for a tenant.
     * Called during hard tenant deletion.
     * WARNING: This is irreversible.
     */
    static async deleteTenantStorage(tenantId: string): Promise<void> {
        const tenantDir = this.getTenantRootDir(tenantId);
        if (fs.existsSync(tenantDir)) {
            await fs.promises.rm(tenantDir, { recursive: true, force: true });
            console.log(`[StorageService] Deleted all files for tenant ${tenantId} at ${tenantDir}`);
        }
    }

    /**
     * Get disk usage (bytes) for a specific tenant's storage.
     * Used in super-admin metrics.
     */
    static async getTenantStorageBytes(tenantId: string): Promise<number> {
        const tenantDir = this.getTenantRootDir(tenantId);
        if (!fs.existsSync(tenantDir)) return 0;
        return this._dirSize(tenantDir);
    }

    private static async _dirSize(dirPath: string): Promise<number> {
        let total = 0;
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                total += await this._dirSize(full);
            } else {
                const stat = await fs.promises.stat(full);
                total += stat.size;
            }
        }
        return total;
    }
}
