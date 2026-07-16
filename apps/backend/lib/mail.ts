import { Resend } from 'resend'
import env from '#start/env'

export const resend = new Resend(env.get('RESEND_API_KEY').release())
