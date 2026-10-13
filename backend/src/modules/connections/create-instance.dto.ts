import { z } from 'zod';

export const createInstanceSchema = z.object({
  tenantId: z.string({ required_error: 'tenantId é obrigatório' }),
  connectionType: z.enum(['QR_CODE', 'CLOUD_API'], { required_error: 'connectionType deve ser QR_CODE ou CLOUD_API' }),
  metaToken: z.string().optional(),
  phoneNumber: z.string().optional(),
}).refine(data => {
  if (data.connectionType === 'CLOUD_API') {
    return !!data.metaToken && !!data.phoneNumber;
  }
  return true;
}, {
  message: "metaToken e phoneNumber são obrigatórios quando connectionType for CLOUD_API",
  path: ["metaToken"]
});

export type CreateInstanceDto = z.infer<typeof createInstanceSchema>;
