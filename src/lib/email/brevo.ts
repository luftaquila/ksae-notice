const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_ACCOUNT_URL = 'https://api.brevo.com/v3/account';

interface EmailParams {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
}

interface BrevoResponse {
  messageId: string;
}

interface BrevoPlan {
  type: string;
  credits: number;
  creditsType: string;
}

export async function getRemainingCredits(): Promise<number> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set');

  const res = await fetch(BREVO_ACCOUNT_URL, {
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo account API error ${res.status}: ${body}`);
  }

  const account: { plan: BrevoPlan[] } = await res.json();
  const freePlan = account.plan.find((p) => p.type === 'free' && p.creditsType === 'sendLimit');
  return freePlan?.credits ?? 0;
}

export async function sendEmail(params: EmailParams): Promise<BrevoResponse> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set');

  const senderEmail = process.env.SENDER_EMAIL;
  const senderName = process.env.SENDER_NAME || 'KSAE 공지봇';
  if (!senderEmail) throw new Error('SENDER_EMAIL is not set');

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: params.to.email, name: params.to.name || params.to.email }],
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }

  return res.json();
}
