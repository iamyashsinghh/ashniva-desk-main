export const TICKET_SOURCE = {
  PORTAL: 'PORTAL',
  MOBILE: 'MOBILE',
  INTERNAL: 'INTERNAL',
  API: 'API',
  IVR: 'IVR',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
} as const;

export type TicketSource = (typeof TICKET_SOURCE)[keyof typeof TICKET_SOURCE];
