import { prisma } from '../../server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { sendWelcomeEmail } from '../../lib/mailer';

interface ImportRow {
    name: string;
    email: string;
    role: string;
}

interface ImportError {
    row: number;
    email: string;
    reason: string;
}

interface ImportResult {
    created: number;
    errors: ImportError[];
}

export class BulkImportService {

    /** Generate CSV template content */
    static generateTemplate(isSuperAdmin = false): string {
        if (isSuperAdmin) {
            return 'Nome Completo,Email,Cargo,Organização (ID)\nJoão Silva,joao@empresa.com,AGENT,tenant-id-exemplo\nMaria Santos,maria@empresa.com,ADMIN,\n';
        }
        return 'Nome Completo,Email,Cargo\nJoão Silva,joao@empresa.com,AGENT\nMaria Santos,maria@empresa.com,ADMIN\n';
    }

    /** Generate a random strong password */
    static generatePassword(length = 12): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
        const bytes = crypto.randomBytes(length);
        return Array.from(bytes, (b) => chars[b % chars.length]).join('');
    }

    /** Process a CSV file for bulk user import */
    static async processImport(csvBuffer: Buffer, contextTenantId: string | undefined, isSuperAdmin: boolean): Promise<ImportResult> {
        const result: ImportResult = { created: 0, errors: [] };

        let records: any[];
        try {
            records = parse(csvBuffer, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
            });
        } catch (err: any) {
            result.errors.push({ row: 0, email: '', reason: `Erro ao ler CSV: ${err.message}` });
            return result;
        }

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2; // +2 because header is row 1

            // Map columns (support PT-BR and EN headers)
            const name = (row['Nome Completo'] || row['name'] || row['Nome'] || '').trim();
            const email = (row['Email'] || row['email'] || row['E-mail'] || '').trim().toLowerCase();
            const roleRaw = (row['Cargo'] || row['role'] || row['Role'] || 'AGENT').trim().toUpperCase();
            const rowTenantId = (row['Organização (ID)'] || row['tenantId'] || row['Tenant'] || '').trim();

            const targetTenantId = isSuperAdmin ? (rowTenantId || contextTenantId) : contextTenantId;

            // Validate
            if (!targetTenantId) {
                result.errors.push({ row: rowNum, email, reason: 'Organização não informada (nem na linha nem no contexto)' });
                continue;
            }
            if (!name) {
                result.errors.push({ row: rowNum, email, reason: 'Nome é obrigatório' });
                continue;
            }
            if (!email || !email.includes('@')) {
                result.errors.push({ row: rowNum, email, reason: 'Email inválido' });
                continue;
            }

            const role = roleRaw === 'ADMIN' ? 'ADMIN' : 'AGENT';

            // Check if email already exists
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) {
                result.errors.push({ row: rowNum, email, reason: 'Email já cadastrado' });
                continue;
            }

            // Generate password and create user
            const rawPassword = this.generatePassword();
            const hashedPassword = await bcrypt.hash(rawPassword, 12);

            try {
                // Verify if targetTenantId exists
                if (isSuperAdmin) {
                    const tenantExists = await prisma.tenant.findUnique({ where: { id: targetTenantId } });
                    if (!tenantExists) {
                        result.errors.push({ row: rowNum, email, reason: 'Organização especificada não existe' });
                        continue;
                    }
                }

                await prisma.user.create({
                    data: { name, email, password: hashedPassword, role, tenantId: targetTenantId },
                });

                // Send welcome email (non-blocking)
                sendWelcomeEmail(email, name, rawPassword, true).catch(err => {
                    console.error(`Failed to send welcome email to ${email}:`, err);
                });

                result.created++;
            } catch (err: any) {
                result.errors.push({ row: rowNum, email, reason: `Erro ao criar: ${err.message}` });
            }
        }

        return result;
    }
}
