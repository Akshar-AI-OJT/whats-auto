import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bot,
  Check,
  Clock3,
  LockKeyhole,
  Mail,
  MessageCircle,
  Rocket,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react'

export type AuthBrandingVariant =
  | 'login'
  | 'register'
  | 'organization'
  | 'forgot-password'
  | 'reset-password'
  | 'otp'

export type AuthBrandingChecklistItem = {
  label: string
  done: boolean
}

/** Floating card / chip content — presentation reads `kind` + layout classNames. */
export type AuthBrandingFloatingCard =
  | {
      kind: 'inbox'
      className: string
      title: string
      subtitle: string
      badge: string
      inbound: string
      outbound: string
      suggestion: string
    }
  | {
      kind: 'broadcast'
      className: string
      title: string
      subtitle: string
      progressPercent: number
      progressLabel: string
    }
  | {
      kind: 'stat'
      className: string
      icon: LucideIcon
      label: string
      value: string
    }
  | {
      kind: 'checklist'
      className: string
      icon: LucideIcon
      title: string
      subtitle: string
      items: AuthBrandingChecklistItem[]
      /** `stepper` shows index for pending; `all-done` always shows checkmarks. */
      listStyle: 'stepper' | 'all-done'
    }
  | {
      kind: 'chip'
      className: string
      icon: LucideIcon
      iconWrapClassName: string
      iconSizeClassName?: string
      title: string
      subtitle: string
    }
  | {
      kind: 'simple'
      className: string
      icon: LucideIcon
      title: string
      subtitle: string
    }
  | {
      kind: 'pill'
      className: string
      icon: LucideIcon
      label: string
    }

export type AuthBrandingConfig = {
  heading: string
  subtitle: string
  footer: string
  /** Preserves existing per-variant heading width/typography. */
  headingClassName: string
  subtitleClassName: string
  floatingCards: AuthBrandingFloatingCard[]
}

const headingClassNameDefault =
  'max-w-[15rem] font-display text-2xl leading-[1.1] tracking-tight text-ink sm:text-3xl md:max-w-[17rem] md:text-[2.05rem]'

const subtitleClassNameDefault = 'max-w-[18rem] text-sm leading-6 text-body'

export const authBrandingConfig: Record<AuthBrandingVariant, AuthBrandingConfig> = {
  login: {
    heading: 'WhatsApp that works while you sleep',
    subtitle: 'Automate replies. Broadcast offers. Close more chats.',
    footer: 'Built for teams that sell and support on WhatsApp',
    headingClassName: headingClassNameDefault,
    subtitleClassName: 'max-w-[17rem] text-sm leading-6 text-body',
    floatingCards: [
      {
        kind: 'inbox',
        className: 'absolute top-2 left-0 z-20 w-[88%] -rotate-2 p-4 sm:w-[90%]',
        title: 'Shared inbox',
        subtitle: '3 open conversations',
        badge: 'Live',
        inbound: 'Hi! Do you ship to Delhi this week?',
        outbound: 'Yes — Thursday delivery. Want tracking?',
        suggestion: 'AI suggested reply',
      },
      {
        kind: 'broadcast',
        className:
          'absolute top-[58%] right-0 z-30 w-[10.75rem] rotate-[4deg] p-3 sm:w-[11.5rem]',
        title: 'Broadcast',
        subtitle: 'Festival offer',
        progressPercent: 72,
        progressLabel: '72% delivered',
      },
      {
        kind: 'stat',
        className:
          'absolute bottom-1 left-1 z-10 flex w-fit -rotate-3 items-center gap-3 px-3 py-2.5',
        icon: BarChart3,
        label: 'Reply rate',
        value: '+18.4%',
      },
    ],
  },

  register: {
    heading: 'Start automating customer conversations.',
    subtitle:
      'Create your organization, connect WhatsApp, invite your team, and launch your first automation in minutes.',
    footer: 'Join teams launching WhatsApp automation in minutes',
    headingClassName:
      'max-w-[16rem] font-display text-2xl leading-[1.1] tracking-tight text-ink sm:text-3xl md:max-w-[18rem] md:text-[2.05rem]',
    subtitleClassName: subtitleClassNameDefault,
    floatingCards: [
      {
        kind: 'checklist',
        className: 'absolute top-2 left-0 z-20 w-[90%] -rotate-2 p-4 sm:w-[92%]',
        icon: Rocket,
        title: 'Setup checklist',
        subtitle: 'Your first 4 steps',
        listStyle: 'stepper',
        items: [
          { label: 'Organization Created', done: true },
          { label: 'WhatsApp Connected', done: false },
          { label: 'Team Invited', done: false },
          { label: 'Automation Active', done: false },
        ],
      },
      {
        kind: 'chip',
        className:
          'absolute top-[58%] right-0 z-30 flex w-[11rem] rotate-[5deg] items-center gap-2 p-3 sm:w-[11.75rem]',
        icon: Rocket,
        iconWrapClassName: 'size-7 bg-primary text-on-primary',
        title: 'First Campaign Ready',
        subtitle: 'Draft saved',
      },
      {
        kind: 'chip',
        className:
          'absolute bottom-1 left-0 z-10 flex w-fit -rotate-3 items-center gap-2.5 px-3 py-2.5',
        icon: Bot,
        iconWrapClassName: 'size-8 bg-ink text-primary',
        iconSizeClassName: 'size-4',
        title: 'AI Assistant Connected',
        subtitle: 'Smart replies on',
      },
      {
        kind: 'pill',
        className:
          'absolute top-[46%] left-[42%] z-0 hidden items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-canvas px-2 py-1 text-[10px] font-medium text-body shadow-sm sm:flex',
        icon: Users,
        label: 'Team',
      },
      {
        kind: 'pill',
        className:
          'absolute top-[38%] right-[8%] z-0 hidden items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-canvas px-2 py-1 text-[10px] font-medium text-body shadow-sm md:flex',
        icon: MessageCircle,
        label: 'WhatsApp',
      },
    ],
  },

  organization: {
    heading: 'Set up your organization.',
    subtitle:
      'You become the Owner automatically. Invite Admins, Agents, and Viewers after you land in the dashboard.',
    footer: 'One organization. Clear ownership. Ready for your team.',
    headingClassName:
      'max-w-[16rem] font-display text-2xl leading-[1.1] tracking-tight text-ink sm:text-3xl md:max-w-[18rem] md:text-[2.05rem]',
    subtitleClassName: subtitleClassNameDefault,
    floatingCards: [
      {
        kind: 'checklist',
        className: 'absolute top-2 left-0 z-20 w-[90%] -rotate-2 p-4 sm:w-[92%]',
        icon: Users,
        title: 'Organization setup',
        subtitle: 'Next up',
        listStyle: 'stepper',
        items: [
          { label: 'Account verified', done: true },
          { label: 'Organization created', done: false },
          { label: 'Owner assigned', done: false },
          { label: 'Invite your team', done: false },
        ],
      },
      {
        kind: 'chip',
        className:
          'absolute top-[58%] right-0 z-30 flex w-[11rem] rotate-[5deg] items-center gap-2 p-3 sm:w-[11.75rem]',
        icon: ShieldCheck,
        iconWrapClassName: 'size-7 bg-primary text-on-primary',
        title: 'You are Owner',
        subtitle: 'Automatic role',
      },
      {
        kind: 'pill',
        className: 'absolute bottom-2 left-2 z-10',
        icon: MessageCircle,
        label: 'WhatsApp-ready organization',
      },
    ],
  },

  'forgot-password': {
    heading: 'Forgot your password?',
    subtitle: "No worries. We'll help you get back into your account securely.",
    footer: 'Secure recovery that gets you back to work fast',
    headingClassName: headingClassNameDefault,
    subtitleClassName: subtitleClassNameDefault,
    floatingCards: [
      {
        kind: 'checklist',
        className: 'absolute top-2 left-0 z-20 w-[90%] -rotate-2 p-4 sm:w-[92%]',
        icon: LockKeyhole,
        title: 'Secure Account Recovery',
        subtitle: 'Encrypted reset flow',
        listStyle: 'stepper',
        items: [
          { label: 'Password Reset Requested', done: true },
          { label: 'Email Verification', done: false },
          { label: 'Back to Work', done: false },
        ],
      },
      {
        kind: 'chip',
        className:
          'absolute top-[58%] right-0 z-30 flex w-[11.25rem] rotate-[5deg] items-center gap-2 p-3 sm:w-[12rem]',
        icon: Mail,
        iconWrapClassName: 'size-7 bg-ink text-primary',
        title: 'Email Verification',
        subtitle: 'One-time link',
      },
      {
        kind: 'chip',
        className:
          'absolute bottom-1 left-0 z-10 flex w-fit -rotate-3 items-center gap-2.5 px-3 py-2.5',
        icon: ShieldCheck,
        iconWrapClassName: 'size-8 bg-[#F1F5F9] text-brand',
        iconSizeClassName: 'size-4',
        title: 'Back to Work',
        subtitle: 'Account unlocked',
      },
    ],
  },

  'reset-password': {
    heading: 'Create a secure new password.',
    subtitle: 'Protect your account with a strong password.',
    footer: 'Strong passwords keep your WhatsApp organization safe',
    headingClassName: headingClassNameDefault,
    subtitleClassName: subtitleClassNameDefault,
    floatingCards: [
      {
        kind: 'checklist',
        className: 'absolute top-2 left-0 z-20 w-[90%] -rotate-2 p-4 sm:w-[92%]',
        icon: Shield,
        title: 'Security Check',
        subtitle: 'Account protection',
        listStyle: 'all-done',
        items: [
          { label: 'Strong Password', done: true },
          { label: 'Secure Account', done: true },
        ],
      },
      {
        kind: 'chip',
        className:
          'absolute top-[56%] right-0 z-30 flex w-[11.25rem] rotate-[5deg] items-center gap-2 p-3 sm:w-[12rem]',
        icon: LockKeyhole,
        iconWrapClassName: 'size-7 bg-ink text-primary',
        title: 'Password Updated',
        subtitle: 'Encrypted & saved',
      },
      {
        kind: 'chip',
        className:
          'absolute bottom-1 left-0 z-10 flex w-fit -rotate-3 items-center gap-2.5 px-3 py-2.5',
        icon: ShieldCheck,
        iconWrapClassName: 'size-8 bg-[#F1F5F9] text-brand',
        iconSizeClassName: 'size-4',
        title: 'Secure Account',
        subtitle: 'Sessions protected',
      },
    ],
  },

  otp: {
    heading: 'Verify your identity.',
    subtitle: 'Enter the verification code to continue securely.',
    footer: 'Secure verification keeps your WhatsApp organization protected',
    headingClassName: headingClassNameDefault,
    subtitleClassName: subtitleClassNameDefault,
    floatingCards: [
      {
        kind: 'simple',
        className: 'absolute top-2 left-0 z-20 w-[90%] -rotate-2 p-4 sm:w-[92%]',
        icon: Mail,
        title: 'Verification Email Sent',
        subtitle: 'Check your inbox for the code',
      },
      {
        kind: 'chip',
        className:
          'absolute top-[48%] right-0 z-30 flex w-[11.5rem] rotate-[5deg] items-center gap-2.5 p-3 sm:w-[12.25rem]',
        icon: Check,
        iconWrapClassName: 'size-7 bg-ink text-primary',
        iconSizeClassName: 'size-3.5 stroke-[2.5]',
        title: 'Secure Login',
        subtitle: 'Encrypted session',
      },
      {
        kind: 'chip',
        className:
          'absolute bottom-1 left-0 z-10 flex w-fit -rotate-3 items-center gap-2.5 px-3 py-2.5',
        icon: Clock3,
        iconWrapClassName: 'size-8 bg-[#F1F5F9] text-brand',
        iconSizeClassName: 'size-4',
        title: 'Code Expires in 10 Minutes',
        subtitle: 'Request a new one anytime',
      },
    ],
  },
}
