export type MockConversation = {
  id: string
  name: string
  preview: string
  /** ISO timestamp used for relative formatting */
  timestamp: string
  unread: number
  status: 'open' | 'waiting' | 'resolved'
  presence: 'online' | 'offline'
}

export type MockCampaign = {
  id: string
  name: string
  status: 'sent' | 'scheduled' | 'draft'
  /** Formatted sent count label (e.g. "8,420" or "—") */
  sent: string
  /** Numeric sent count when available */
  sentCount: number | null
  /** Delivery rate 0–100 when available */
  deliveredPercent: number | null
  /** Overall progress 0–100 for the visual bar */
  progress: number
  when: string
}

export type MockActivityType =
  | 'campaign'
  | 'contact'
  | 'template'
  | 'inbox'

export type MockActivity = {
  id: string
  title: string
  detail: string
  /** ISO timestamp used for relative formatting */
  timestamp: string
  type: MockActivityType
  tone: 'green' | 'blue' | 'amber' | 'neutral'
}

export type MockQuickAction = {
  id: string
  titleKey: 'newCampaign' | 'addContact' | 'createTemplate' | 'broadcastMessage'
  descriptionKey:
    | 'newCampaignDesc'
    | 'addContactDesc'
    | 'createTemplateDesc'
    | 'broadcastMessageDesc'
}

export const MOCK_KPIS = {
  totalContacts: { value: '12,480', delta: '+8.2%', tone: 'up' as const },
  activeConversations: { value: '318', delta: '+12', tone: 'up' as const },
  campaignsSent: { value: '46', delta: '+3', tone: 'up' as const },
  deliveryRate: { value: '97.4%', delta: '-0.3%', tone: 'down' as const },
}

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString()

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: 'c1',
    name: 'Priya Sharma',
    preview: 'Can you share the pricing for the Growth plan?',
    timestamp: minutesAgo(2),
    unread: 2,
    status: 'open',
    presence: 'online',
  },
  {
    id: 'c2',
    name: 'Acme Support',
    preview: 'Order #4821 was delivered successfully.',
    timestamp: minutesAgo(18),
    unread: 0,
    status: 'resolved',
    presence: 'offline',
  },
  {
    id: 'c3',
    name: 'Rahul Mehta',
    preview: 'Waiting on template approval before we launch.',
    timestamp: minutesAgo(62),
    unread: 1,
    status: 'waiting',
    presence: 'online',
  },
  {
    id: 'c4',
    name: 'Nova Retail',
    preview: 'Thanks! The bot handled the FAQ perfectly.',
    timestamp: minutesAgo(185),
    unread: 0,
    status: 'resolved',
    presence: 'offline',
  },
]

export const MOCK_CAMPAIGNS: MockCampaign[] = [
  {
    id: 'camp1',
    name: 'July Product Launch',
    status: 'sent',
    sent: '8,420',
    sentCount: 8420,
    deliveredPercent: 97.8,
    progress: 97.8,
    when: 'Today',
  },
  {
    id: 'camp2',
    name: 'Win-back Offer',
    status: 'scheduled',
    sent: '—',
    sentCount: null,
    deliveredPercent: null,
    progress: 72,
    when: 'Tomorrow 10:00',
  },
  {
    id: 'camp3',
    name: 'Onboarding Nurture',
    status: 'sent',
    sent: '3,105',
    sentCount: 3105,
    deliveredPercent: 96.1,
    progress: 96.1,
    when: '2 days ago',
  },
  {
    id: 'camp4',
    name: 'Flash Sale Reminder',
    status: 'draft',
    sent: '—',
    sentCount: null,
    deliveredPercent: null,
    progress: 35,
    when: 'Draft',
  },
]

export const MOCK_ACTIVITY: MockActivity[] = [
  {
    id: 'a1',
    title: 'Campaign delivered',
    detail: 'July Product Launch reached 8,240 contacts.',
    timestamp: minutesAgo(12),
    type: 'campaign',
    tone: 'green',
  },
  {
    id: 'a2',
    title: 'New contact imported',
    detail: '240 contacts added from CSV upload.',
    timestamp: minutesAgo(45),
    type: 'contact',
    tone: 'blue',
  },
  {
    id: 'a3',
    title: 'Template pending review',
    detail: '“Order update v2” awaits WhatsApp approval.',
    timestamp: minutesAgo(120),
    type: 'template',
    tone: 'amber',
  },
  {
    id: 'a4',
    title: 'Inbox SLA breached',
    detail: '1 conversation exceeded the 15-minute reply target.',
    timestamp: minutesAgo(240),
    type: 'inbox',
    tone: 'neutral',
  },
]

export const MOCK_QUICK_ACTIONS: MockQuickAction[] = [
  {
    id: 'qa1',
    titleKey: 'newCampaign',
    descriptionKey: 'newCampaignDesc',
  },
  {
    id: 'qa2',
    titleKey: 'addContact',
    descriptionKey: 'addContactDesc',
  },
  {
    id: 'qa3',
    titleKey: 'createTemplate',
    descriptionKey: 'createTemplateDesc',
  },
  {
    id: 'qa4',
    titleKey: 'broadcastMessage',
    descriptionKey: 'broadcastMessageDesc',
  },
]

export type MockNotificationType =
  | 'campaign'
  | 'message'
  | 'billing'
  | 'system'

export type MockNotification = {
  id: string
  title: string
  body: string
  timestamp: string
  type: MockNotificationType
  read: boolean
}

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: 'n1',
    title: 'Campaign delivered',
    body: 'July Product Launch finished with 97.8% delivery.',
    timestamp: minutesAgo(8),
    type: 'campaign',
    read: false,
  },
  {
    id: 'n2',
    title: 'New inbox reply',
    body: 'Priya Sharma asked about Growth plan pricing.',
    timestamp: minutesAgo(26),
    type: 'message',
    read: false,
  },
  {
    id: 'n3',
    title: 'Invoice ready',
    body: 'Your July invoice for the Growth plan is available.',
    timestamp: minutesAgo(95),
    type: 'billing',
    read: false,
  },
  {
    id: 'n4',
    title: 'Template approved',
    body: '“Order update v2” was approved by WhatsApp.',
    timestamp: minutesAgo(210),
    type: 'system',
    read: true,
  },
  {
    id: 'n5',
    title: 'Broadcast queued',
    body: 'Win-back Offer is scheduled for tomorrow at 10:00.',
    timestamp: minutesAgo(360),
    type: 'campaign',
    read: true,
  },
]
