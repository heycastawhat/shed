import nodemailer, { type Transporter } from 'nodemailer';

// Email for notifications, when SHED_SMTP_URL is set (smtp://user:pass@host:587 or smtps://…:465). Sending never blocks or fails a request.
let transport: Transporter | null = null;
let from = '';
export function setMailer(url: string | undefined, sender: string | undefined) {
	transport = url ? nodemailer.createTransport(url) : null;
	from = sender || 'Shed <shed@localhost>';
}
export const mailEnabled = () => !!transport;

export function sendMail(to: string, subject: string, text: string, headers: Record<string, string> = {}) {
	if (!transport) return;
	transport.sendMail({ from, to, subject, text, headers }).catch((e: Error) => console.error('mail', to, e.message));
}
