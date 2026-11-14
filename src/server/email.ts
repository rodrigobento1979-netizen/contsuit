import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercel ? path.resolve('/tmp', 'contsuite_data') : path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'email_settings.json');

// Ensure directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  // ignore
}

export function getSmtpConfig(): SmtpConfig | null {
  // 1. Check environment variables first (e.g. from Vercel)
  const envHost = process.env.SMTP_HOST;
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;

  if (envHost && envUser && envPass) {
    const port = Number(process.env.SMTP_PORT) || 587;
    return {
      host: envHost,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      user: envUser,
      pass: envPass,
      fromName: process.env.SMTP_FROM_NAME || 'ContSuite Contábil',
      fromEmail: process.env.SMTP_FROM_EMAIL || envUser,
    };
  }

  // 2. Check stored settings in JSON file
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.host && parsed.user && parsed.pass) {
        return parsed as SmtpConfig;
      }
    }
  } catch (err) {
    console.warn('Could not read email_settings.json:', err);
  }

  return null;
}

export function saveSmtpConfig(config: SmtpConfig): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save email settings:', err);
    throw new Error('Falha ao gravar configurações de e-mail no disco.');
  }
}

export async function testSmtpConnection(config: SmtpConfig, testRecipient: string): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });

    await transporter.verify();

    const fromAddress = `"${config.fromName}" <${config.fromEmail || config.user}>`;
    await transporter.sendMail({
      from: fromAddress,
      to: testRecipient,
      subject: '✓ Teste de Envio de E-mail Direto - ContSuite Contábil',
      text: 'Parabéns! O seu servidor SMTP está configurado e funcionando perfeitamente no ContSuite Contábil. Todos os convites e credenciais agora serão enviados automaticamente para a caixa de entrada dos seus clientes com cópia para você.',
      html: `
        <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 550px; margin: 0 auto; border: 1px solid #14b8a6; border-radius: 12px; padding: 24px; background: #ffffff;">
          <div style="background-color: #004d40; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px;">ContSuite Contábil</h2>
            <p style="color: #a7ffeb; margin: 4px 0 0 0; font-size: 12px;">Disparo Direto de E-mails Ativado</p>
          </div>
          <p style="font-size: 15px; font-weight: bold; color: #0f766e;">Conexão SMTP validada com sucesso!</p>
          <p style="font-size: 13px; line-height: 1.6; color: #334155;">
            Este e-mail confirma que o ContSuite agora envia e-mails automaticamente a partir do seu endereço <strong>${config.fromEmail || config.user}</strong>.
          </p>
          <div style="background: #f0fdfa; border: 1px solid #99f6e4; padding: 12px; border-radius: 8px; font-size: 12px; margin: 16px 0;">
            ✓ Envio direto de convites de novos usuários ativado.<br/>
            ✓ Cópia de controle (CC) para o Administrador Master ativada.<br/>
            ✓ Template oficial ContSuite com link dinâmico e senha.
          </div>
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px;">
            Enviado em ${new Date().toLocaleString('pt-BR')} pelo ContSuite Contábil
          </p>
        </div>
      `,
    });

    return {
      success: true,
      message: `Conexão SMTP validada com sucesso! Um e-mail de teste foi enviado para ${testRecipient}.`,
    };
  } catch (err: any) {
    console.error('SMTP test error:', err);
    const rawMsg = String(err?.message || '');
    let friendly = rawMsg || 'Falha ao conectar com o servidor SMTP. Verifique o host, porta e credenciais.';
    if (rawMsg.includes('535') || rawMsg.includes('BadCredentials') || rawMsg.includes('Username and Password not accepted')) {
      friendly = `Google recusou o usuário (${config.user}) ou a Senha de App (535 BadCredentials). Confirme se: 1) A Senha de App foi criada logado exatamente na conta ${config.user} (e não em outro Gmail aberto no navegador); 2) A Verificação em duas etapas está ativa nessa conta; 3) Não há erro de digitação nem espaços extras; 4) Há algum alerta de segurança bloqueando o acesso na caixa de entrada de ${config.user}.`;
    }
    return {
      success: false,
      message: friendly,
    };
  }
}

export async function sendEmail({
  to,
  cc,
  subject,
  html,
  text,
}: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{
  sent: boolean;
  messageId?: string;
  error?: string;
  senderAddress?: string;
}> {
  const config = getSmtpConfig();
  if (!config) {
    return {
      sent: false,
      error: 'Servidor SMTP não configurado no sistema. Adicione os dados em Configurações de E-mail ou variáveis de ambiente.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
    });

    const fromAddress = `"${config.fromName}" <${config.fromEmail || config.user}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      cc,
      subject,
      html,
      text: text || undefined,
    });

    console.log(`[Email] Sent successfully to ${to} (cc: ${cc}): ${info.messageId}`);
    return {
      sent: true,
      messageId: info.messageId,
      senderAddress: fromAddress,
    };
  } catch (err: any) {
    console.error(`[Email] Failed to send email to ${to}:`, err);
    return {
      sent: false,
      error: err.message || 'Falha ao enviar e-mail via SMTP.',
    };
  }
}
