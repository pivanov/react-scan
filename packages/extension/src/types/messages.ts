import { z } from 'zod';

/**
 *  Incoming messages (from popup to content)
 */
export const IncomingMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('OPEN_PANEL'),
  }),
  z.object({
    type: z.literal('START_SCAN'),
  }),
  z.object({
    type: z.literal('STOP_SCAN'),
  }),
  z.object({
    type: z.literal('CSP_RULES_CHANGED'),
    data: z.object({
      enabled: z.boolean(),
    }),
  }),
]);

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

/**
 * Outgoing messages (from content to popup)
 */
export const OutgoingMessageSchema = z.union([
  z.object({
    type: z.literal('SCAN_UPDATE'),
    reactVersion: z.string().optional(),
    componentCount: z.number().optional(),
    rerenderCount: z.number().optional(),
    status: z.string().optional(),
  }),
  z.object({
    type: z.literal('SCAN_COMPLETE'),
  }),
]);

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;
