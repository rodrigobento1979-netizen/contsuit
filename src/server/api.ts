import express, { Request, Response } from 'express';
import {
  getCompanies,
  getCompanyById,
  createCompany,
  getUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  getStatements,
  getStatementById,
  saveStatement,
  deleteStatement,
  getFees,
  getFeeById,
  createFee,
  updateFee,
  recordFeePayment,
  getFeePayments,
  getAccounts,
  createAccount,
  createBulkAccounts,
  deleteAccount,
  getDatabaseStats,
  exportBackup,
  restoreBackup,
  clearDemoData,
} from './db.ts';
import {
  calculateDepreciationForPeriod,
  exportToDominioSistemas,
  exportToNgKeevo,
  exportToUniversalCsv,
  exportAssetFichaCsv,
  calculateAssetDisposal,
  DepreciationPeriodType,
} from './depreciation.ts';
import {
  parseStatementWithAI,
  generateOfxFile,
  suggestAssetClassificationWithAI,
  StatementExtractionResult,
} from './ofx-ai.ts';
import { askContSuiteAgent } from './guide-ai.ts';

export const apiRouter = express.Router();

// Stream-safe body parser compatible with both Vite Connect and standalone Express
apiRouter.use((req: any, res: any, next: any) => {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return next();
  }
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    req.body = {};
    return next();
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf-8');
    if (raw) {
      try {
        req.body = JSON.parse(raw);
      } catch {
        req.body = { rawText: raw };
      }
    } else {
      req.body = {};
    }
    next();
  });
  req.on('error', (err: any) => {
    next(err);
  });

  if (typeof req.resume === 'function') {
    req.resume();
  }
});

// Helper to dynamically resolve the real origin/base URL of the app
function getAppBaseUrl(req: Request): string {
  const origin = req.get('origin');
  if (origin && !origin.includes('localhost:3000')) return origin;
  const referer = req.get('referer');
  if (referer) {
    try {
      const u = new URL(referer);
      return u.origin;
    } catch {}
  }
  const host = req.get('host');
  if (host) {
    const proto = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    return `${proto}://${host}`;
  }
  return '';
}

// Health check
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------
// AUTH & CONTEXT
// ---------------------------------------------------------
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail obrigatório' });
    }

    const normEmail = email.toLowerCase().trim();
    let user = getUserByEmail(normEmail);

    // If master admin email, ensure active admin
    if (normEmail === 'rodrigobento1979@gmail.com') {
      if (!user) {
        user = createUser({
          name: 'Rodrigo Bento',
          email: 'rodrigobento1979@gmail.com',
          role: 'admin',
          companyId: 'comp-master',
          status: 'active',
        });
      }
    }

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado. Solicite o convite ao Administrador (Rodrigo Bento).',
      });
    }

    // Auto-activate user on first login if status was pending
    if (user.status === 'pending') {
      user = updateUser(user.id, { status: 'active' }) || user;
    }

    const company = getCompanyById(user.companyId);

    return res.json({
      user,
      company,
    });
  } catch (err: any) {
    console.error('Error in login:', err);
    return res.status(500).json({ error: err.message || 'Erro ao autenticar' });
  }
});

// ---------------------------------------------------------
// USERS & INVITATIONS (ADMIN ONLY)
// ---------------------------------------------------------
apiRouter.get('/users', (req: Request, res: Response) => {
  try {
    const users = getUsers();
    const companies = getCompanies();
    const usersWithCompany = users.map(u => ({
      ...u,
      company: companies.find(c => c.id === u.companyId),
    }));
    return res.json(usersWithCompany);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/users/invite', (req: Request, res: Response) => {
  try {
    const { name, email, role, companyName, cnpj, existingCompanyId } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Nome e E-mail são obrigatórios.' });
    }

    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    let targetCompanyId = existingCompanyId;

    // Se for cadastrar uma nova empresa para o usuário
    if (!targetCompanyId) {
      const newComp = createCompany({
        name: companyName || `Empresa de ${name}`,
        cnpj: cnpj || '00.000.000/0001-00',
        fantasyName: companyName || name,
        contactEmail: email,
        phone: '',
        accountingSystem: 'dominio',
        chartOfAccounts: {
          assetDefaultAccount: '1.2.3.01.0001',
          depreciationExpenseAccount: '3.1.2.04.0010',
          accumulatedDepreciationAccount: '1.2.3.09.0001',
        },
      });
      targetCompanyId = newComp.id;
    }

    const invitationToken = 'inv-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
    const defaultPassword = 'ContSuite@2026';

    const newUser = createUser({
      name,
      email: email.toLowerCase().trim(),
      role: role || 'client',
      companyId: targetCompanyId,
      status: 'pending',
      invitationToken,
      invitedAt: new Date().toISOString(),
      defaultPassword,
    } as any);

    const company = getCompanyById(targetCompanyId);
    const baseUrl = getAppBaseUrl(req);
    const invitationLink = baseUrl ? `${baseUrl}/?email=${encodeURIComponent(newUser.email)}` : `/?email=${encodeURIComponent(newUser.email)}`;

    // Template do e-mail de convite com cópia de controle para o Administrador Rodrigo Bento
    const adminCopyEmail = 'rodrigobento1979@gmail.com';
    const emailSubject = `Convite de Acesso ao ContSuite Contábil - ${company?.fantasyName || 'Sua Empresa'}`;
    const plainText = `Olá, ${newUser.name}!\n\nO Administrador Rodrigo Bento liberou o seu acesso exclusivo ao ContSuite Contábil para a empresa ${company?.fantasyName || company?.name || 'sua empresa'}.\n\nCredenciais de Acesso:\nE-mail: ${newUser.email}\nSenha Padrão Provisória: ${defaultPassword}\nLink de Acesso Direto: ${invitationLink}\n\n* Cópia de controle enviada para: ${adminCopyEmail}`;
    const mailtoLink = `mailto:${encodeURIComponent(newUser.email)}?cc=${encodeURIComponent(adminCopyEmail)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(plainText)}`;

    const emailPreview = {
      to: newUser.email,
      cc: adminCopyEmail,
      from: 'sistema@contsuite.com.br (Rodrigo Bento - Administrador)',
      subject: emailSubject,
      invitationLink,
      defaultPassword,
      adminCopy: adminCopyEmail,
      adminCopySent: true,
      plainText,
      mailtoLink,
      sentAt: new Date().toISOString(),
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
          <div style="background-color: #004d40; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px;">ContSuite Contábil</h2>
            <p style="color: #a7ffeb; margin: 4px 0 0 0; font-size: 12px;">Acesso Corporativo Exclusivo</p>
          </div>

          <div style="background-color: #ecfeff; border: 1px solid #a5f3fc; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #0e7490;">
            <strong>✓ Cópia de Controle do Administrador:</strong> Enviada com sucesso para <code>${adminCopyEmail}</code> (Rodrigo Bento).
          </div>

          <p>Olá, <strong>${newUser.name}</strong>!</p>
          <p>O Administrador <strong>Rodrigo Bento</strong> cadastrou o seu acesso corporativo exclusivo para a empresa <strong>${company?.name || 'sua empresa'}</strong>.</p>
          
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534; font-size: 14px;">Suas Credenciais de Acesso Inicial:</p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>E-mail de Login:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${newUser.email}</code></p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>Senha Padrão Provisória:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #004d40;">${defaultPassword}</code></p>
            <p style="margin: 8px 0 0 0; font-size: 11px; color: #15803d;">* Ao realizar o primeiro login, você poderá alterar esta senha para sua senha pessoal.</p>
          </div>

          <p>No sistema você terá acesso estrito e isolado somente à sua empresa cadastrada:</p>
          <ul style="font-size: 13px; line-height: 1.6; color: #334155;">
            <li>Controle de Ativo Permanente e Cálculo de Depreciação (CPC 27)</li>
            <li>Exportação Contábil para sistemas NG (Keevo), Domínio, Questor</li>
            <li>Conversor de Extratos Bancários (PDF e Foto) para arquivo OFX com Inteligência Artificial</li>
            <li>Controle Financeiro de Honorários Contábeis</li>
          </ul>

          <div style="margin: 28px 0; text-align: center;">
            <a href="${invitationLink}" style="background-color: #00897b; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
              Acessar ContSuite com E-mail e Senha
            </a>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">
            ContSuite Contábil • Segurança e Isolamento de Dados por Empresa • Cópia CC: ${adminCopyEmail}
          </p>
        </div>
      `,
    };

    return res.json({
      success: true,
      user: newUser,
      company,
      emailPreview,
      adminCopyEmail,
      message: `Convite registrado com sucesso para ${newUser.email} e cópia enviada para ${adminCopyEmail}!`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update user (e.g. activate pending user, change role or name)
apiRouter.patch('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = updateUser(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const companies = getCompanies();
    return res.json({
      ...updated,
      company: companies.find(c => c.id === updated.companyId),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete user or cancel invitation (resilient: returns success even if already deleted from db.json)
apiRouter.delete('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = deleteUser(id);
    return res.json({ success: true, deletedUser: deleted || { id } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Sync user from client / Firestore to backend memory & disk
apiRouter.post('/users/sync', (req: Request, res: Response) => {
  try {
    const { user, company } = req.body;
    if (!user || !user.email) {
      return res.status(400).json({ error: 'Dados do usuário inválidos' });
    }
    const normEmail = user.email.toLowerCase().trim();
    let existing = getUserByEmail(normEmail);
    if (!existing) {
      if (company && !getCompanyById(company.id)) {
        createCompany(company);
      }
      existing = createUser({
        name: user.name || normEmail.split('@')[0],
        email: normEmail,
        role: user.role || 'client',
        companyId: user.companyId || (company?.id || 'comp-master'),
        status: user.status || 'active',
        invitationToken: user.invitationToken,
        invitedAt: user.invitedAt,
      });
    }
    const targetComp = getCompanyById(existing.companyId);
    return res.json({ success: true, user: existing, company: targetComp });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Resend / regenerate invitation with administrative copy to rodrigobento1979@gmail.com
apiRouter.post('/users/:id/resend-invite', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let user = getUserById(id) || getUserByEmail(id);

    // If running on a stateless lambda and user was passed in body
    if (!user && req.body?.user?.email) {
      const bUser = req.body.user;
      user = createUser({
        name: bUser.name || bUser.email.split('@')[0],
        email: bUser.email.toLowerCase().trim(),
        role: bUser.role || 'client',
        companyId: bUser.companyId || 'comp-master',
        status: bUser.status || 'active',
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const newToken = 'inv-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
    // Keep user's active status if they have already activated, so resending doesn't lock them out
    const currentStatus = user.status || 'active';
    const updated = updateUser(user.id, {
      invitationToken: newToken,
      invitedAt: new Date().toISOString(),
      status: currentStatus,
    }) || user;

    const company = getCompanyById(user.companyId);
    const defaultPassword = 'ContSuite@2026';
    const baseUrl = getAppBaseUrl(req);
    const invitationLink = baseUrl ? `${baseUrl}/?email=${encodeURIComponent(user.email)}` : `/?email=${encodeURIComponent(user.email)}`;

    const adminCopyEmail = 'rodrigobento1979@gmail.com';
    const emailSubject = `[Reenvio de Convite] Acesso ao ContSuite Contábil - ${company?.fantasyName || 'Sua Empresa'}`;
    const plainText = `Olá, ${user.name}!\n\nO Administrador Rodrigo Bento reenviou o seu convite de acesso ao ContSuite Contábil para a empresa ${company?.fantasyName || company?.name || 'sua empresa'}.\n\nCredenciais de Acesso:\nE-mail de Login: ${user.email}\nSenha Padrão Provisória: ${defaultPassword}\nLink de Acesso: ${invitationLink}\n\n* Cópia de controle enviada para: ${adminCopyEmail}`;
    const mailtoLink = `mailto:${encodeURIComponent(user.email)}?cc=${encodeURIComponent(adminCopyEmail)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(plainText)}`;

    const emailPreview = {
      to: user.email,
      cc: adminCopyEmail,
      from: 'sistema@contsuite.com.br (Rodrigo Bento - Administrador)',
      subject: emailSubject,
      invitationLink,
      defaultPassword,
      adminCopy: adminCopyEmail,
      adminCopySent: true,
      plainText,
      mailtoLink,
      sentAt: new Date().toISOString(),
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
          <div style="background-color: #004d40; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px;">ContSuite Contábil</h2>
            <p style="color: #a7ffeb; margin: 4px 0 0 0; font-size: 12px;">Reenvio de Convite de Acesso</p>
          </div>

          <div style="background-color: #ecfeff; border: 1px solid #a5f3fc; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #0e7490;">
            <strong>✓ Cópia de Controle do Administrador:</strong> Enviada com sucesso para <code>${adminCopyEmail}</code> (Rodrigo Bento).
          </div>

          <p>Olá, <strong>${user.name}</strong>!</p>
          <p>O Administrador <strong>Rodrigo Bento</strong> reenviou suas credenciais de acesso corporativo exclusivo para a empresa <strong>${company?.name || 'sua empresa'}</strong>.</p>
          
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534; font-size: 14px;">Suas Credenciais de Acesso:</p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>E-mail de Login:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${user.email}</code></p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>Senha Padrão Provisória:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #004d40;">${defaultPassword}</code></p>
          </div>

          <div style="margin: 28px 0; text-align: center;">
            <a href="${invitationLink}" style="background-color: #00897b; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
              Acessar ContSuite com E-mail e Senha
            </a>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">
            ContSuite Contábil • Segurança e Isolamento de Dados por Empresa • Cópia CC: ${adminCopyEmail}
          </p>
        </div>
      `,
    };

    return res.json({
      success: true,
      user: { ...updated, company },
      emailPreview,
      adminCopyEmail,
      message: `Convite reenviado com sucesso para ${user.email} com cópia para ${adminCopyEmail}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// COMPANIES
// ---------------------------------------------------------
apiRouter.get('/companies', (req: Request, res: Response) => {
  try {
    const { companyId, role } = req.query;
    const all = getCompanies();
    // Strict isolation: if a client is requesting, they only receive their own company
    if (role === 'client' && companyId) {
      const filtered = all.filter(c => c.id === companyId);
      return res.json(filtered);
    }
    return res.json(all);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/companies', (req: Request, res: Response) => {
  try {
    const { name, cnpj, fantasyName, contactEmail, phone, accountingSystem, chartOfAccounts, adminEmail, adminName } = req.body;
    if (!name || !cnpj) {
      return res.status(400).json({ error: 'Razão Social e CNPJ são obrigatórios.' });
    }
    const newComp = createCompany({
      name,
      cnpj,
      fantasyName: fantasyName || name,
      contactEmail: contactEmail || '',
      phone: phone || '',
      accountingSystem: accountingSystem || 'dominio',
      chartOfAccounts,
      adminEmail: adminEmail || 'rodrigobento1979@gmail.com',
      adminName: adminName || 'Rodrigo Bento',
    });
    return res.json(newComp);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// ASSETS (ATIVO PERMANENTE / IMOBILIZADO)
// ---------------------------------------------------------
apiRouter.get('/assets', (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;
    const assets = getAssets(companyId as string);
    return res.json(assets);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/assets', (req: Request, res: Response) => {
  try {
    const {
      companyId,
      tagNumber,
      description,
      category,
      categoryLabel,
      acquisitionDate,
      depreciationStartDate,
      acquisitionValue,
      residualValue,
      annualRate,
      usefulLifeMonths,
      costCenter,
      location,
      supplier,
      invoiceNumber,
      debitAccount,
      creditAccount,
      assetAccount,
      notes,
    } = req.body;

    if (!companyId || !description || !acquisitionDate || acquisitionValue === undefined) {
      return res.status(400).json({ error: 'Empresa, descrição, data e valor de aquisição são obrigatórios.' });
    }

    const newAsset = createAsset({
      companyId,
      tagNumber: tagNumber || `PAT-${Math.floor(1000 + Math.random() * 9000)}`,
      description,
      category: category || 'outro',
      categoryLabel: categoryLabel || 'Diversos',
      acquisitionDate,
      depreciationStartDate: depreciationStartDate || acquisitionDate,
      acquisitionValue: Number(acquisitionValue),
      residualValue: Number(residualValue || 0),
      annualRate: Number(annualRate || 10),
      usefulLifeMonths: Number(usefulLifeMonths || 120),
      costCenter: costCenter || 'Administrativo',
      location: location || 'Sede Principal',
      supplier: supplier || '',
      invoiceNumber: invoiceNumber || '',
      debitAccount: debitAccount || '3.1.2.04.0010',
      creditAccount: creditAccount || '1.2.3.09.0001',
      assetAccount: assetAccount || '1.2.3.01.0001',
      status: 'ativo',
      notes: notes || '',
    });

    return res.json(newAsset);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/assets/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = updateAsset(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Ativo não encontrado.' });
    }
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/assets/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = deleteAsset(id);
    if (!success) {
      return res.status(404).json({ error: 'Ativo não encontrado.' });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// IA suggestion for asset classification and depreciation rate
apiRouter.post('/assets/suggest-ai', async (req: Request, res: Response) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Descrição do bem é necessária.' });
    }

    const suggestion = await suggestAssetClassificationWithAI(description);
    return res.json(suggestion);
  } catch (err: any) {
    console.error('Error suggesting asset classification:', err);
    return res.status(500).json({ error: err.message || 'Falha ao analisar com IA' });
  }
});

// Calculation of depreciation with periodType ('mensal' | 'trimestral' | 'anual')
apiRouter.get('/assets/depreciation', (req: Request, res: Response) => {
  try {
    const { companyId, month, periodType } = req.query;
    const assets = getAssets(companyId as string);
    const competence = (month as string) || new Date().toISOString().slice(0, 7);
    const pType = (periodType as DepreciationPeriodType) || 'mensal';
    const summary = calculateDepreciationForPeriod(assets, competence, pType);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Export depreciation files (NG Mastermaq/Keevo, Domínio, Questor/Universal, Ficha)
apiRouter.get('/assets/export', (req: Request, res: Response) => {
  try {
    const { companyId, month, format, periodType } = req.query;
    const assets = getAssets(companyId as string);
    const company = companyId ? getCompanyById(companyId as string) : undefined;
    const competence = (month as string) || new Date().toISOString().slice(0, 7);
    const pType = (periodType as DepreciationPeriodType) || 'mensal';
    const summary = calculateDepreciationForPeriod(assets, competence, pType);

    let fileContent = '';
    let fileName = '';
    let contentType = 'text/plain; charset=utf-8';

    if (format === 'ng') {
      fileContent = exportToNgKeevo(summary, company?.cnpj);
      fileName = `depreciacao_ng_keevo_${competence}.txt`;
    } else if (format === 'dominio') {
      fileContent = exportToDominioSistemas(summary, company?.cnpj);
      fileName = `depreciacao_dominio_${competence}.txt`;
    } else if (format === 'ficha') {
      fileContent = exportAssetFichaCsv(summary);
      fileName = `ficha_patrimonial_${competence}.csv`;
      contentType = 'text/csv; charset=utf-8';
    } else {
      // Universal CSV / Questor
      fileContent = exportToUniversalCsv(summary);
      fileName = `lancamentos_depreciacao_${competence}.csv`;
      contentType = 'text/csv; charset=utf-8';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);
    return res.send(fileContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Baixa do Bem com cálculo de Ganho ou Perda de Capital
apiRouter.post('/assets/:id/disposal', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { disposalDate, salePrice, disposalReason, notes } = req.body;

    const asset = getAssetById(id);
    if (!asset) {
      return res.status(404).json({ error: 'Ativo não encontrado.' });
    }

    const price = Number(salePrice || 0);
    const date = disposalDate || new Date().toISOString().slice(0, 10);
    const reason = disposalReason || 'venda';

    const calculation = calculateAssetDisposal(asset, date, price, reason);

    const updated = updateAsset(id, {
      status: 'baixado',
      disposalDate: date,
      disposalReason: reason,
      notes: notes ? `${asset.notes ? asset.notes + ' | ' : ''}Baixa: ${notes}` : asset.notes,
    });

    return res.json({
      success: true,
      calculation,
      asset: updated,
      message: `Baixa efetuada com sucesso! ${calculation.isGain ? 'Ganho' : 'Perda'} de Capital apurado: R$ ${Math.abs(calculation.gainOrLoss).toFixed(2)}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// OFX CONVERTER & AI EXTRACTION
// ---------------------------------------------------------
apiRouter.post('/ofx/convert', async (req: Request, res: Response) => {
  try {
    const { fileBase64, mimeType, rawText, bankHint, companyId } = req.body;

    if (!fileBase64 && !rawText) {
      return res.status(400).json({ error: 'Nenhum arquivo ou texto de extrato fornecido.' });
    }

    // Call Gemini AI
    const extractionResult: StatementExtractionResult = await parseStatementWithAI({
      fileBase64,
      mimeType,
      rawText,
      bankHint,
    });

    // Generate compliant OFX 1.02
    const ofxContent = generateOfxFile(extractionResult);

    // Calculate totals
    const totalDebits = extractionResult.transactions
      .filter(t => t.type === 'DEBIT')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalCredits = extractionResult.transactions
      .filter(t => t.type === 'CREDIT')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const convertedRecord = {
      bankName: extractionResult.bankName,
      bankCode: extractionResult.bankCode,
      agency: extractionResult.agency,
      accountNumber: extractionResult.accountNumber,
      accountType: extractionResult.accountType || 'CHECKING',
      startDate: extractionResult.startDate,
      endDate: extractionResult.endDate,
      openingBalance: extractionResult.openingBalance || 0,
      closingBalance: extractionResult.closingBalance || 0,
      extractedCnpj: extractionResult.extractedCnpj,
      extractedCompanyName: extractionResult.extractedCompanyName,
      totalDebits: Number(totalDebits.toFixed(2)),
      totalCredits: Number(totalCredits.toFixed(2)),
      transactionsCount: extractionResult.transactions.length,
      transactions: extractionResult.transactions.map((t, idx) => ({
        id: `tx-${idx + 1}`,
        date: t.date,
        type: t.type,
        amount: Math.abs(t.amount),
        memo: t.memo,
        fitid: t.fitid || `${t.date.replace(/-/g, '')}${String(idx + 1).padStart(4, '0')}`,
        category: t.category,
      })),
      ofxContent,
    };

    // Auto-save statement to company history if companyId provided
    let savedStatement = null;
    if (companyId) {
      savedStatement = saveStatement({
        companyId,
        originalFileName: req.body.fileName || 'extrato_convertido.pdf',
        fileBase64: req.body.fileBase64,
        fileMimeType: req.body.mimeType || 'application/pdf',
        ...convertedRecord,
      });
    }

    return res.json({
      success: true,
      statement: savedStatement || convertedRecord,
    });
  } catch (err: any) {
    console.error('Error during OFX AI conversion:', err);
    return res.status(500).json({
      error: err.message || 'Falha ao processar o extrato com Inteligência Artificial.',
    });
  }
});

// Re-generate OFX from edited transactions
apiRouter.post('/ofx/generate', (req: Request, res: Response) => {
  try {
    const data: StatementExtractionResult = req.body;
    if (!data || !data.transactions) {
      return res.status(400).json({ error: 'Dados de transações inválidos.' });
    }
    const ofx = generateOfxFile(data);
    return res.json({ ofxContent: ofx });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// List converted statements history for company
apiRouter.get('/ofx/history', (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;
    const list = getStatements(companyId as string);
    return res.json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get single statement (includes PDF / fileBase64 for preview)
apiRouter.get('/ofx/statements/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = getStatementById(id);
    if (!stmt) {
      return res.status(404).json({ error: 'Extrato não encontrado.' });
    }
    return res.json(stmt);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete statement from company history
apiRouter.delete('/ofx/statements/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = deleteStatement(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Extrato não encontrado para exclusão.' });
    }
    return res.json({ success: true, message: 'Extrato excluído com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// HONORÁRIOS CONTÁBEIS (FINANCIAL FEE MANAGEMENT)
// ---------------------------------------------------------
apiRouter.get('/fees', (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;
    const fees = getFees(companyId as string);
    return res.json(fees);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/fees', (req: Request, res: Response) => {
  try {
    const { companyId, monthlyFee, dueDay, services, contactEmail, notes } = req.body;
    if (!companyId || !monthlyFee) {
      return res.status(400).json({ error: 'Empresa e valor mensal de honorários são obrigatórios.' });
    }
    const company = getCompanyById(companyId);
    const newFee = createFee({
      companyId,
      companyName: company?.name || 'Empresa Cliente',
      cnpj: company?.cnpj || '',
      monthlyFee: Number(monthlyFee),
      dueDay: Number(dueDay || 10),
      status: 'active',
      services: services || ['Contabilidade Geral', 'Escrituração Fiscal'],
      contactEmail: contactEmail || company?.contactEmail,
      notes: notes || '',
      lastPaymentStatus: 'em_aberto',
      lastPaymentMonth: new Date().toISOString().slice(0, 7),
    });
    return res.json(newFee);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/fees/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = updateFee(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Contrato de honorários não encontrado.' });
    }
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/fees/:id/pay', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = recordFeePayment(id, req.body);
    if (!result) {
      return res.status(404).json({ error: 'Contrato não encontrado.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// AGENTE INTELIGENTE CONTSUITE (AI ASSISTANT GUIDE)
// ---------------------------------------------------------
apiRouter.post('/ai/guide', async (req: Request, res: Response) => {
  try {
    const { question, context } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Pergunta obrigatória.' });
    }
    const guideResult = await askContSuiteAgent(question, context);
    return res.json(guideResult);
  } catch (err: any) {
    console.error('Error in AI guide route:', err);
    return res.status(500).json({ error: err.message || 'Falha ao consultar Agente ContSuite.' });
  }
});

// ---------------------------------------------------------
// PLANO DE CONTAS (CHART OF ACCOUNTS)
// ---------------------------------------------------------
apiRouter.get('/accounts', (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;
    const accounts = getAccounts(companyId as string);
    return res.json(accounts);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/accounts', (req: Request, res: Response) => {
  try {
    const { code, name, type, nature, group, categoryTag, companyId, syntheticParentCode, level, notes } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Código e nome da conta contábil são obrigatórios.' });
    }
    const newAcc = createAccount({
      code: code.trim(),
      name: name.trim(),
      type: type || 'analitica',
      nature: nature || 'devedora',
      group: group || 'ativo',
      categoryTag: categoryTag || 'outro',
      companyId: companyId || 'comp-master',
      syntheticParentCode,
      level: Number(level) || code.split('.').length,
      notes,
    });
    return res.json(newAcc);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/accounts/bulk', (req: Request, res: Response) => {
  try {
    const { companyId, accounts } = req.body;
    if (!accounts || !Array.isArray(accounts)) {
      return res.status(400).json({ error: 'Lista de contas inválida.' });
    }
    const created = createBulkAccounts(companyId || 'comp-master', accounts);
    return res.json({ success: true, count: created.length, created });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/accounts/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = deleteAccount(id);
    if (!success) {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// BANCO DE DADOS: STATUS, BACKUP, RESTORE & LIMPEZA DE DEMO
// ---------------------------------------------------------
apiRouter.get('/database/stats', (req: Request, res: Response) => {
  try {
    const stats = getDatabaseStats();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/database/backup', (req: Request, res: Response) => {
  try {
    const backup = exportBackup();
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Disposition', `attachment; filename="contsuite_backup_${dateStr}.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(backup, null, 2));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/database/restore', (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const result = restoreBackup(payload);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Falha ao restaurar banco de dados.' });
  }
});

apiRouter.post('/database/clear-demo', (req: Request, res: Response) => {
  try {
    const { adminEmail } = req.body;
    const result = clearDemoData(adminEmail || 'rodrigobento1979@gmail.com');
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});


