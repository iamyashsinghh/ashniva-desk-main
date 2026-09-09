import {
  PRIORITY,
  TICKET_SOURCE,
  TICKET_STATUS,
  TICKET_TYPE,
  VISIBILITY,
  type Priority,
  type TicketSource,
  type TicketStatus,
  type TicketType,
} from '@ashniva/types';

import type { SeedProjectKey } from './seed-projects';
import type { SeededOrganizations } from './seed-organizations';
import type { CommentSeed } from './seed-tasks-data';
import type { SeededTeams } from './seed-teams';
import type { SeedUserKey } from './seed-users';

export interface TicketSeed {
  number: number;
  client: keyof SeededOrganizations;
  requester: SeedUserKey;
  project?: SeedProjectKey;
  title: string;
  description: string;
  type: TicketType;
  priority: Priority;
  status: TicketStatus;
  source?: TicketSource;
  assignee?: SeedUserKey;
  team?: keyof SeededTeams;
  module?: string;
  impact?: string;
  ageDays: number;
  lastChangeDaysAgo: number;
  resolution?: string;
  lastNote?: string;
  /** Task numbers created from this ticket. */
  linkedTasks?: number[];
  comments?: CommentSeed[];
}

const [S, T, P, V] = [TICKET_STATUS, TICKET_TYPE, PRIORITY, VISIBILITY];

/** Demo tickets in every Phase 1 status, from two separate clients and a group company. */
export const TICKET_SEEDS: readonly TicketSeed[] = [
  {
    number: 1,
    client: 'acme',
    requester: 'clientAdmin',
    project: 'acmePos',
    title: 'Daily closing totals do not match the register',
    description: 'Every evening the closing report is short by the refund amount.',
    type: T.BUG,
    priority: P.CRITICAL,
    status: S.REVIEW,
    assignee: 'developer',
    team: 'web',
    module: 'Reports',
    impact: 'Store managers cannot close the day without manual correction.',
    ageDays: 3,
    lastChangeDaysAgo: 0,
    linkedTasks: [1],
    comments: [
      {
        author: 'support',
        visibility: V.CLIENT,
        body: 'Thank you, we reproduced this and a fix is being tested.',
        dayOffset: -2,
      },
      {
        author: 'support',
        visibility: V.INTERNAL,
        body: 'Converted to ACM-1 for Priya.',
        dayOffset: -2,
      },
    ],
  },
  {
    number: 2,
    client: 'acme',
    requester: 'clientEmployee',
    project: 'acmePos',
    title: 'Barcode scanner not detected on the new counter',
    description: 'The new scanner at counter 3 beeps but nothing appears on screen.',
    type: T.SUPPORT,
    priority: P.HIGH,
    status: S.ASSIGNED,
    assignee: 'developer',
    team: 'web',
    module: 'Hardware',
    ageDays: 1,
    lastChangeDaysAgo: 1,
    linkedTasks: [2],
  },
  {
    number: 3,
    client: 'acme',
    requester: 'clientAdmin',
    project: 'acmeStore',
    title: 'Customers cannot pay by UPI',
    description: 'UPI option shows an error after entering the UPI id.',
    type: T.BUG,
    priority: P.HIGH,
    status: S.WAITING_CLIENT,
    assignee: 'developer',
    team: 'web',
    module: 'Checkout',
    ageDays: 3,
    lastChangeDaysAgo: 1,
    lastNote: 'Asked the client for a screenshot of the error.',
    comments: [
      {
        author: 'developer',
        visibility: V.CLIENT,
        body: 'Could you share a screenshot of the error and the time it happened?',
        dayOffset: -1,
      },
    ],
  },
  {
    number: 4,
    client: 'zenith',
    requester: 'zenithEmployee',
    project: 'zenithFleet',
    title: 'Vehicle markers flicker on the live map',
    description:
      'Markers vanish for a second on every refresh; dispatchers lose track of vehicles.',
    type: T.BUG,
    priority: P.CRITICAL,
    status: S.IN_PROGRESS,
    assignee: 'developer2',
    team: 'web',
    module: 'Live map',
    impact: 'Dispatch cannot follow vehicles reliably.',
    ageDays: 1,
    lastChangeDaysAgo: 0,
    linkedTasks: [18],
    comments: [
      {
        author: 'support',
        visibility: V.CLIENT,
        body: 'We are on it — a developer is working on the fix now.',
        dayOffset: 0,
      },
    ],
  },
  {
    number: 5,
    client: 'zenith',
    requester: 'zenithAdmin',
    project: 'zenithFleet',
    title: 'Need Excel export for trip reports',
    description: 'Finance needs the trip report in Excel every week.',
    type: T.CHANGE_REQUEST,
    priority: P.MEDIUM,
    status: S.RESOLVED,
    assignee: 'developer2',
    team: 'web',
    module: 'Reports',
    ageDays: 4,
    lastChangeDaysAgo: 0,
    resolution: 'Excel export added under Reports → Trips → Export.',
    linkedTasks: [19],
    comments: [
      {
        author: 'support',
        visibility: V.CLIENT,
        body: 'The export is now live. Please confirm it has the columns you need.',
        dayOffset: 0,
      },
    ],
  },
  {
    number: 6,
    client: 'zenith',
    requester: 'zenithAdmin',
    title: 'Add two dispatcher accounts',
    description: 'New dispatchers joining Monday need accounts.',
    type: T.ACCESS,
    priority: P.LOW,
    status: S.CLOSED,
    assignee: 'support',
    team: 'support',
    ageDays: 6,
    lastChangeDaysAgo: 4,
    resolution: 'Accounts created and credentials sent to the IT manager.',
  },
  {
    number: 7,
    client: 'acme',
    requester: 'clientEmployee',
    project: 'acmePos',
    title: 'Receipt still shows the old store address',
    description: 'Store 4 receipts print the old registered address.',
    type: T.BUG,
    priority: P.MEDIUM,
    status: S.REOPENED,
    assignee: 'developer2',
    team: 'web',
    module: 'Billing',
    ageDays: 7,
    lastChangeDaysAgo: 1,
    lastNote: 'Reopened by the client: store 4 still affected.',
    linkedTasks: [10],
    comments: [
      {
        author: 'clientEmployee',
        visibility: V.CLIENT,
        body: 'Still wrong in store 4 after yesterday’s update.',
        dayOffset: -1,
      },
    ],
  },
  {
    number: 8,
    client: 'groupCompany',
    requester: 'employee',
    project: 'groupPayroll',
    title: 'Cannot download last month’s payslip',
    description: 'The download button shows a spinner and nothing happens.',
    type: T.SUPPORT,
    priority: P.MEDIUM,
    status: S.NEW,
    source: TICKET_SOURCE.INTERNAL,
    ageDays: 0,
    lastChangeDaysAgo: 0,
  },
  {
    number: 9,
    client: 'acme',
    requester: 'clientAdmin',
    title: 'Training session for new store staff',
    description: 'Twelve new staff members start next week and need POS training.',
    type: T.TRAINING,
    priority: P.LOW,
    status: S.NEW,
    ageDays: 0,
    lastChangeDaysAgo: 0,
  },
  {
    number: 10,
    client: 'zenith',
    requester: 'zenithEmployee',
    project: 'zenithFleet',
    title: 'Map not loading (duplicate)',
    description: 'Same as the marker flicker issue.',
    type: T.OTHER,
    priority: P.LOW,
    status: S.CANCELLED,
    ageDays: 1,
    lastChangeDaysAgo: 1,
    lastNote: 'Duplicate of T-4.',
  },
  {
    number: 11,
    client: 'acme',
    requester: 'clientEmployee',
    project: 'acmePos',
    title: 'Printer prints blank receipts after the update',
    description: 'After this morning’s update the receipt printer outputs blank paper.',
    type: T.BUG,
    priority: P.HIGH,
    status: S.RESOLVED,
    assignee: 'support',
    team: 'support',
    module: 'Hardware',
    ageDays: 0,
    lastChangeDaysAgo: 0,
    resolution: 'Paper width was reset to 58 mm; corrected in Settings → Printer.',
    comments: [
      {
        author: 'support',
        visibility: V.CLIENT,
        body: 'Fixed remotely — please print a test receipt and confirm.',
        dayOffset: 0,
      },
      {
        author: 'support',
        visibility: V.INTERNAL,
        body: 'Root cause: the new printer settings screen defaulted to 58 mm.',
        dayOffset: 0,
      },
    ],
  },
  {
    number: 12,
    client: 'zenith',
    requester: 'zenithAdmin',
    project: 'zenithFleet',
    title: 'Fuel report totals are rounded',
    description: 'Litres show as whole numbers.',
    type: T.BUG,
    priority: P.LOW,
    status: S.CLOSED,
    assignee: 'developer2',
    team: 'web',
    module: 'Reports',
    ageDays: 3,
    lastChangeDaysAgo: 1,
    resolution: 'Report now shows two decimals.',
    linkedTasks: [22],
  },
];
