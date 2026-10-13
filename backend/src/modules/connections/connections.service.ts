import crypto from 'crypto';
import { prisma } from '../../server';
import { encrypt, decrypt, generateVerifyToken, maskToken } from '../../lib/crypto';
import { ZapoService } from '../../lib/zapo';

export class ConnectionsService {
    /**
     * List connections scoped to a specific tenant.
     */
    static async findAll(tenantId: string) {
        const connections = await prisma.whatsAppConnection.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return connections.map((c: (typeof connections)[number]) => ({
            ...c,
            accessTokenEnc: undefined,
            accessTokenMasked: c.accessTokenEnc ? maskToken(decrypt(c.accessTokenEnc)) : null,
        }));
    }

    /**
     * Get a single connection by ID, scoped to the caller's tenant.
     * Throws 403 if the connection belongs to a different tenant.
     */
    static async findById(id: string, tenantId: string) {
        const conn = await prisma.whatsAppConnection.findUnique({ where: { id } });
        if (!conn) throw new Error('Conexão não encontrada');
        if (conn.tenantId !== tenantId) throw Object.assign(new Error('Acesso negado'), { status: 403 });
        return {
            ...conn,
            accessTokenEnc: undefined,
            accessTokenMasked: conn.accessTokenEnc ? maskToken(decrypt(conn.accessTokenEnc)) : null,
        };
    }

    /**
     * Find a connection by phone_number_id (for webhook routing).
     * Returns the full connection with DECRYPTED token in memory.
     */
    static async findByPhoneNumberId(phoneNumberId: string) {
        const conn = await prisma.whatsAppConnection.findUnique({
            where: { phoneNumberId },
        });
        if (!conn || !conn.accessTokenEnc) return null;
        return {
            ...conn,
            accessToken: decrypt(conn.accessTokenEnc),
        };
    }

    /**
     * Create a new connection and register it with Zapo.
     * - type 'qr_code_web': creates a local Zapo instance → QR code will be emitted via Socket.io
     * - type 'official_meta': creates a Meta Business instance → connected immediately
     */
    static async create(data: {
        name: string;
        type?: string;
        wabaId?: string;
        phoneNumberId?: string;
        accessToken?: string;
        tenantId: string;
    }) {
        const type = (data.type || 'qr_code_web') as 'qr_code_web' | 'official_meta';

        let accessTokenEnc: string | undefined;
        let verifyToken: string | undefined;

        if (type === 'official_meta') {
            if (!data.accessToken) {
                throw new Error('Access Token é obrigatório para conexão Oficial Meta.');
            }
            accessTokenEnc = encrypt(data.accessToken);
            verifyToken = generateVerifyToken();
        }

        const id = crypto.randomUUID();
        // Create record in DB first
        const conn = await prisma.whatsAppConnection.create({
            data: {
                id,
                name: data.name,
                type,
                wabaId: data.wabaId,
                phoneNumberId: data.phoneNumberId,
                accessTokenEnc,
                verifyToken,
                isConnected: false,
                sessionStatus: 'connecting',
                tenantId: data.tenantId,
                evolutionInstanceName: id, // compatibility fallback
            },
        });

        if (type === 'qr_code_web') {
            try {
                await ZapoService.connect(conn.id, conn.tenantId);
            } catch (zapoError: any) {
                console.error('[ConnectionsService] Zapo error during create:', zapoError.message);
                try { await prisma.whatsAppConnection.delete({ where: { id: conn.id } }); } catch {}
                throw zapoError;
            }
        } else if (type === 'official_meta') {
            try {
                await prisma.whatsAppConnection.update({
                    where: { id: conn.id },
                    data: { sessionStatus: 'connected', isConnected: true },
                });
            } catch (err: any) {
                if (err.code !== 'P2025') throw err;
            }
        }

        const updated = await prisma.whatsAppConnection.findUnique({ where: { id: conn.id } });

        return {
            ...(updated || conn),
            accessTokenEnc: undefined,
            accessTokenMasked: data.accessToken ? maskToken(data.accessToken) : null,
        };
    }

    /**
     * Update connection. Re-encrypts if token changes.
     */
    static async update(id: string, data: {
        name?: string;
        wabaId?: string;
        phoneNumberId?: string;
        accessToken?: string;
    }) {
        const updateData: any = {};
        if (data.name) updateData.name = data.name;
        if (data.wabaId) updateData.wabaId = data.wabaId;
        if (data.phoneNumberId) updateData.phoneNumberId = data.phoneNumberId;
        if (data.accessToken) updateData.accessTokenEnc = encrypt(data.accessToken);

        const conn = await prisma.whatsAppConnection.update({
            where: { id },
            data: updateData,
        });

        return {
            ...conn,
            accessTokenEnc: undefined,
            accessTokenMasked: data.accessToken
                ? maskToken(data.accessToken)
                : (conn.accessTokenEnc ? maskToken(decrypt(conn.accessTokenEnc)) : null),
        };
    }

    /**
     * Delete a connection: verifies tenant ownership, logs out & removes from Zapo, then removes from DB.
     */
    static async delete(id: string, tenantId: string) {
        const conn = await prisma.whatsAppConnection.findUnique({ where: { id } });
        if (!conn) throw new Error('Conexão não encontrada');
        if (conn.tenantId !== tenantId) throw Object.assign(new Error('Acesso negado'), { status: 403 });

        if (conn.type === 'qr_code_web') {
            try {
                await ZapoService.logout(conn.id);
            } catch (err: any) {
                console.warn('[ConnectionsService] Zapo logout warning:', err.message);
            }
        }

        return prisma.whatsAppConnection.delete({ where: { id } });
    }

    /**
     * Fetch the current QR code from Zapo.
     */
    static async getQrCode(id: string, tenantId: string): Promise<{ qrcode: string | null; status: string }> {
        const conn = await prisma.whatsAppConnection.findUnique({ where: { id } });
        if (!conn) throw new Error('Conexão não encontrada');
        if (conn.tenantId !== tenantId) throw Object.assign(new Error('Acesso negado'), { status: 403 });
        if (conn.type !== 'qr_code_web') throw new Error('Apenas conexões QR Code possuem QR Code.');

        const qrcode = ZapoService.getQrCode(id);
        return { qrcode, status: conn.sessionStatus };
    }

    /**
     * Test a connection.
     */
    static async testConnection(id: string, tenantId: string) {
        const conn = await prisma.whatsAppConnection.findUnique({ where: { id } });
        if (!conn) throw new Error('Conexão não encontrada');
        if (conn.tenantId !== tenantId) throw Object.assign(new Error('Acesso negado'), { status: 403 });

        if (conn.type === 'qr_code_web') {
            try {
                const client = ZapoService.getClient(id);
                const connected = client.getState().connected;
                await prisma.whatsAppConnection.update({
                    where: { id },
                    data: { isConnected: connected, sessionStatus: connected ? 'connected' : 'disconnected' },
                });
                return { success: connected, data: { connected, loggedIn: connected } };
            } catch {
                return { success: false, data: { connected: false, loggedIn: false } };
            }
        }

        return { success: false, error: 'Instância Official Meta não configurada.' };
    }

    /**
     * Find connection by verify_token (for webhook verification).
     */
    static async findByVerifyToken(verifyToken: string) {
        return prisma.whatsAppConnection.findFirst({
            where: { verifyToken },
        });
    }

    /**
     * Restart a Zapo instance (logout + connect to trigger fresh QR).
     */
    static async restartInstance(id: string, tenantId: string) {
        const conn = await prisma.whatsAppConnection.findUnique({ where: { id } });
        if (!conn) throw new Error('Conexão não encontrada');
        if (conn.tenantId !== tenantId) throw Object.assign(new Error('Acesso negado'), { status: 403 });

        if (conn.type === 'qr_code_web') {
            try { await ZapoService.logout(conn.id); } catch { /* ignore */ }
            try { await ZapoService.connect(conn.id, conn.tenantId); } catch { /* ignore */ }
        }

        try {
            await prisma.whatsAppConnection.update({
                where: { id },
                data: { sessionStatus: 'connecting', isConnected: false },
            });
        } catch (err: any) {
            if (err.code !== 'P2025') throw err;
        }

        return { success: true, message: 'Reconexão iniciada. Aguarde o QR Code.' };
    }
}
