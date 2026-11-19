import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { PDFDocument } from 'pdf-lib';
import {
  Company,
  CompanyDocument,
  ConvertedStatement,
  DocumentCategory,
  createDocument,
  getCompanies,
  getUsers,
  saveStatement,
  updateDocument,
} from './db.ts';
import {
  analyzePdfPagesWithAI,
  classifyDocumentWithAI,
  PageClassificationItem,
} from './document-ai.ts';
import {
  getInboxConfig,
  getProcessedEmailKeys,
  InboxImapConfig,
  markEmailKeysProcessed,
  saveInboxConfig,
} from './email.ts';
import {
  generateOfxFile,
  parseStatementWithAI,
  StatementExtractionResult,
} from './ofx-ai.ts';

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.ofx',
  '.xml',
  '.csv',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.xls',
  '.xlsx',
  '.doc',
  '.docx',
];

function formatFriendlyImapError(err: any, userEmail: string): string {
  const raw = String(err?.responseText || err?.message || err || '');
  const lower = raw.toLowerCase();
  if (
    lower.includes('invalid credentials') ||
    lower.includes('authenticationfailed') ||
    lower.includes('username and password not accepted') ||
    lower.includes('application-specific password') ||
    lower.includes('web login required')
  ) {
    return `Google recusou o acesso IMAP de ${userEmail}. Verifique se: 1) A Verificação em duas etapas está ativa na conta ${userEmail}; 2) Foi gerada uma Senha de App de 16 caracteres especificamente para ${userEmail}; 3) O acesso IMAP está habilitado no Gmail (Configurações > Encaminhamento e POP/IMAP).`;
  }
  if (lower.includes('etimedout') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return `Não foi possível conectar ao servidor IMAP (${raw}). Verifique host, porta (993) e conexão de rede.`;
  }
  return raw || 'Erro desconhecido ao acessar caixa de entrada via IMAP.';
}

function normalizeMime(contentType: string | undefined, fileName: string): string {
  const clean = (contentType || '').split(';')[0].trim().toLowerCase();
  if (clean && clean !== 'application/octet-stream') {
    return clean === 'image/jpg' ? 'image/jpeg' : clean;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.ofx')) return 'application/x-ofx';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return clean || 'application/octet-stream';
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = (fileName || '').toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function resolveCompanyForEmail(params: {
  senderEmail: string;
  subject: string;
  bodyText: string;
  fileName: string;
  detectedCnpj?: string;
}): Company | undefined {
  const companies = getCompanies();
  if (!companies.length) return undefined;

  const users = getUsers();
  const normSender = params.senderEmail.toLowerCase().trim();

  // 1. Match by sender email in companies.contactEmail
  const byContact = companies.find(
    (c) => c.contactEmail && c.contactEmail.toLowerCase().trim() === normSender
  );
  if (byContact) return byContact;

  // 2. Match by sender email in users table
  const matchedUser = users.find(
    (u) => u.email && u.email.toLowerCase().trim() === normSender
  );
  if (matchedUser?.companyId) {
    const userComp = companies.find((c) => c.id === matchedUser.companyId);
    if (userComp) return userComp;
  }

  // 3. Match by CNPJ found in document AI or email text/subject
  const combinedText = `${params.detectedCnpj || ''}\n${params.subject}\n${params.bodyText}\n${params.fileName}`;
  const cnpjMatches = combinedText.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  for (const rawCnpj of cnpjMatches) {
    const digits = rawCnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      const comp = companies.find((c) => c.cnpj.replace(/\D/g, '') === digits);
      if (comp) return comp;
    }
  }

  // 4. Match by company fantasyName or name inside subject/body/filename
  const haystack = `${params.subject} ${params.bodyText.slice(0, 1500)} ${params.fileName}`.toLowerCase();
  for (const comp of companies) {
    if (comp.id === 'comp-master') continue;
    const fantasy = (comp.fantasyName || '').toLowerCase().trim();
    const legal = (comp.name || '').toLowerCase().trim();
    if (fantasy.length >= 4 && haystack.includes(fantasy)) return comp;
    if (legal.length >= 5 && haystack.includes(legal)) return comp;
  }

  return companies.find((c) => c.id === 'comp-master') || companies[0];
}

function buildStatementRecordFromExtraction(
  extractionResult: StatementExtractionResult,
  ofxContent: string
) {
  const totalDebits = extractionResult.transactions
    .filter((t) => t.type === 'DEBIT')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalCredits = extractionResult.transactions
    .filter((t) => t.type === 'CREDIT')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return {
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
    totalPages: extractionResult.totalPages || 1,
    pagesProcessed: extractionResult.pagesProcessed || extractionResult.totalPages || 1,
    totalDebits: Number(totalDebits.toFixed(2)),
    totalCredits: Number(totalCredits.toFixed(2)),
    transactionsCount: extractionResult.transactions.length,
    transactions: extractionResult.transactions.map((t, idx) => ({
      id: `tx-${idx + 1}`,
      date: t.date,
      type: t.type,
      amount: Math.abs(t.amount),
      memo: t.memo,
      fitid: t.fitid || `${t.date.replace(/-/g, '')}${String(idx + 1).padStart(5, '0')}`,
      category: t.category,
    })),
    ofxContent,
  };
}

async function splitPdfAttachmentOnServer(
  fileName: string,
  buffer: Buffer
): Promise<
  Array<{
    fileName: string;
    base64: string;
    fileSize: number;
    category: DocumentCategory;
    groupLabel: string;
    competenceMonth: string;
    documentDate?: string;
    issuerOrBank?: string;
    documentNumber?: string;
    amount?: number;
    detectedCnpj?: string;
    summary: string;
    aiClassified: boolean;
  }> | null
> {
  if (buffer.length > 4_000_000) return null;

  let srcPdf: PDFDocument;
  try {
    srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    return null;
  }

  const totalPages = srcPdf.getPageCount();
  if (totalPages <= 1 || totalPages > 12) {
    return null;
  }

  const allPages: PageClassificationItem[] = [];
  const base64Full = buffer.toString('base64');

  if (totalPages <= 6 && base64Full.length <= 2_400_000) {
    const res = await analyzePdfPagesWithAI({
      fileName,
      base64Data: base64Full,
      pageCount: totalPages,
      startPageNumber: 1,
    });
    allPages.push(...res.pages);
  } else {
    const BATCH = 4;
    for (let start = 0; start < totalPages; start += BATCH) {
      const end = Math.min(start + BATCH - 1, totalPages - 1);
      const subDoc = await PDFDocument.create();
      const indices: number[] = [];
      for (let p = start; p <= end; p++) indices.push(p);
      const copied = await subDoc.copyPages(srcPdf, indices);
      copied.forEach((p) => subDoc.addPage(p));
      const subBytes = await subDoc.save();
      const res = await analyzePdfPagesWithAI({
        fileName,
        base64Data: Buffer.from(subBytes).toString('base64'),
        pageCount: indices.length,
        startPageNumber: start + 1,
      });
      allPages.push(...res.pages);
    }
  }

  const uniqueCategories = new Set(allPages.map((p) => p.category));
  if (uniqueCategories.size <= 1) {
    return null;
  }

  // Group pages by category + clean groupLabel
  const buckets = new Map<
    string,
    {
      category: DocumentCategory;
      groupLabel: string;
      pages: PageClassificationItem[];
    }
  >();

  for (const p of allPages) {
    const normLabel = p.category === 'extrato' ? 'Extrato Bancário' : p.groupLabel || p.category;
    const key = `${p.category}::${normLabel.toLowerCase()}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.pages.push(p);
    } else {
      buckets.set(key, {
        category: p.category,
        groupLabel: normLabel,
        pages: [p],
      });
    }
  }

  if (buckets.size <= 1) return null;

  const baseName = fileName.replace(/\.pdf$/i, '');
  const out: Array<{
    fileName: string;
    base64: string;
    fileSize: number;
    category: DocumentCategory;
    groupLabel: string;
    competenceMonth: string;
    documentDate?: string;
    issuerOrBank?: string;
    documentNumber?: string;
    amount?: number;
    detectedCnpj?: string;
    summary: string;
    aiClassified: boolean;
  }> = [];

  for (const bucket of buckets.values()) {
    const subDoc = await PDFDocument.create();
    const indices = bucket.pages.map((p) => p.pageNumber - 1);
    const copied = await subDoc.copyPages(srcPdf, indices);
    copied.forEach((p) => subDoc.addPage(p));
    const bytes = await subDoc.save();
    const b64 = Buffer.from(bytes).toString('base64');
    const first = bucket.pages[0];
    const safeTag = bucket.category === 'extrato' ? 'Extrato' : bucket.groupLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 28);

    out.push({
      fileName: `${baseName}_${safeTag}.pdf`.slice(0, 200),
      base64: b64,
      fileSize: bytes.length,
      category: bucket.category,
      groupLabel: bucket.groupLabel,
      competenceMonth: first.competenceMonth || new Date().toISOString().slice(0, 7),
      documentDate: first.documentDate,
      issuerOrBank: first.issuerOrBank,
      documentNumber: first.documentNumber,
      amount: bucket.pages.reduce((sum, p) => sum + (p.amount || 0), 0) || undefined,
      detectedCnpj: first.detectedCnpj,
      summary: first.summary,
      aiClassified: bucket.pages.some((p) => p.aiClassified),
    });
  }

  return out;
}

export async function testInboxConnection(config: InboxImapConfig): Promise<{
  success: boolean;
  message: string;
  totalMessages?: number;
  unseenMessages?: number;
}> {
  if (!config.host || !config.user || !config.pass) {
    return {
      success: false,
      message: 'Informe o servidor IMAP, e-mail e Senha de Aplicativo para testar.',
    };
  }

  const client = new ImapFlow({
    host: config.host,
    port: Number(config.port) || 993,
    secure: config.secure !== false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
    connectionTimeout: 12000,
    greetingTimeout: 12000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      const totalMessages = status && typeof status === 'object' ? status.messages || 0 : 0;
      const unseenMessages = status && typeof status === 'object' ? status.unseen || 0 : 0;
      return {
        success: true,
        totalMessages,
        unseenMessages,
        message: `Caixa ${config.user} conectada com sucesso! (${totalMessages} e-mails na Inbox, ${unseenMessages} não lidos).`,
      };
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }
  } catch (err: any) {
    await client.logout().catch(() => {});
    return {
      success: false,
      message: formatFriendlyImapError(err, config.user),
    };
  }
}

let isSyncInProgress = false;

export interface EmailSyncResult {
  success: boolean;
  importedDocuments: CompanyDocument[];
  importedStatements: ConvertedStatement[];
  checkedMessages: number;
  message: string;
  error?: string;
}

export async function syncEmailInbox(options?: {
  maxMessages?: number;
  forceAllRecent?: boolean;
  silentIfUnconfigured?: boolean;
}): Promise<EmailSyncResult> {
  const cfg = getInboxConfig();
  if (!cfg.pass || !cfg.user) {
    const msg = 'Recebimento automático por e-mail ainda não configurado (falta Senha de App para contsuitesistemas@gmail.com).';
    return {
      success: false,
      importedDocuments: [],
      importedStatements: [],
      checkedMessages: 0,
      message: msg,
      error: options?.silentIfUnconfigured ? undefined : msg,
    };
  }

  if (isSyncInProgress) {
    return {
      success: true,
      importedDocuments: [],
      importedStatements: [],
      checkedMessages: 0,
      message: 'Sincronização da caixa de entrada já está em execução.',
    };
  }

  isSyncInProgress = true;
  const importedDocuments: CompanyDocument[] = [];
  const importedStatements: ConvertedStatement[] = [];
  let checkedMessages = 0;

  const client = new ImapFlow({
    host: cfg.host || 'imap.gmail.com',
    port: Number(cfg.port) || 993,
    secure: cfg.secure !== false,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const processedKeys = getProcessedEmailKeys();
    const newlyProcessedKeys: string[] = [];

    try {
      const uidValidity = String(client.mailbox && typeof client.mailbox === 'object' ? client.mailbox.uidValidity || '1' : '1');
      const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const searchQuery = options?.forceAllRecent
        ? { since: sinceDate }
        : { seen: false, since: sinceDate };

      const uids = await client.search(searchQuery, { uid: true });
      const maxMsgs = options?.maxMessages || 20;
      const targetUids = Array.isArray(uids) ? uids.slice(-maxMsgs).reverse() : [];

      for (const uid of targetUids) {
        const uidKey = `${uidValidity}:${uid}`;
        if (processedKeys.has(uidKey)) continue;

        checkedMessages++;
        const downloaded = await client.download(String(uid), undefined, { uid: true });
        if (!downloaded?.content) {
          newlyProcessedKeys.push(uidKey);
          continue;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of downloaded.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawBuffer = Buffer.concat(chunks);
        const parsed = await simpleParser(rawBuffer);

        const msgIdKey = parsed.messageId ? `msgid:${parsed.messageId.trim()}` : '';
        if (msgIdKey && processedKeys.has(msgIdKey)) {
          newlyProcessedKeys.push(uidKey);
          continue;
        }

        const subject = (parsed.subject || 'Documento sem assunto').trim();
        const senderEmail = (parsed.from?.value?.[0]?.address || 'remetente@desconhecido.com').toLowerCase().trim();
        const bodyText = (parsed.text || '').trim();

        // Ignore internal system notification emails generated by ContSuite itself
        if (
          subject.startsWith('[ContSuite]') ||
          subject.includes('Teste de Envio de E-mail Direto - ContSuite') ||
          subject.includes('Convite de Acesso ao ContSuite')
        ) {
          newlyProcessedKeys.push(uidKey);
          if (msgIdKey) newlyProcessedKeys.push(msgIdKey);
          continue;
        }

        const validAttachments = (parsed.attachments || []).filter((att) => {
          const fname = att.filename || '';
          if (!fname || !hasAllowedExtension(fname)) return false;
          // Ignore tiny inline signature logos (< 15 KB)
          if (att.contentDisposition === 'inline' && att.content.length < 15_000) {
            return false;
          }
          return att.content && att.content.length > 0 && att.content.length <= 12_000_000;
        });

        if (validAttachments.length === 0) {
          newlyProcessedKeys.push(uidKey);
          if (msgIdKey) newlyProcessedKeys.push(msgIdKey);
          continue;
        }

        for (const att of validAttachments) {
          const origName = (att.filename || `anexo_${Date.now()}.pdf`).trim();
          const mimeType = normalizeMime(att.contentType, origName);
          const buffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
          const base64Full = buffer.toString('base64');
          const isPdf = mimeType === 'application/pdf' || origName.toLowerCase().endsWith('.pdf');

          // Check if multi-page mixed PDF should be separated into extratos + receipts
          const splitGroups = isPdf ? await splitPdfAttachmentOnServer(origName, buffer).catch(() => null) : null;

          if (splitGroups && splitGroups.length > 0) {
            for (const grp of splitGroups) {
              const matchedComp = resolveCompanyForEmail({
                senderEmail,
                subject,
                bodyText,
                fileName: grp.fileName,
                detectedCnpj: grp.detectedCnpj,
              });
              const targetCompId = matchedComp?.id || 'comp-master';

              const createdDoc = createDocument({
                companyId: targetCompId,
                fileName: grp.fileName,
                mimeType: 'application/pdf',
                fileSize: grp.fileSize,
                category: grp.category,
                status: 'pendente',
                competenceMonth: grp.competenceMonth,
                documentDate: grp.documentDate,
                issuerOrBank: grp.issuerOrBank,
                documentNumber: grp.documentNumber,
                amount: grp.amount,
                detectedCnpj: grp.detectedCnpj,
                summary: grp.summary,
                aiClassified: grp.aiClassified,
                confidence: grp.aiClassified ? 94 : 80,
                sourceGroupLabel: `Via E-mail · ${grp.groupLabel}`.slice(0, 120),
                notes: `Recebido via e-mail (${senderEmail}) • Assunto: ${subject}`.slice(0, 500),
                uploadedBy: `email:${senderEmail}`.slice(0, 150),
                ofxStatus: grp.category === 'extrato' ? 'idle' : undefined,
                fileBase64: grp.base64.length <= 3_500_000 ? grp.base64 : undefined,
              });

              const { fileBase64: _b64, ...meta } = createdDoc;
              importedDocuments.push({ ...meta, hasOriginalFile: Boolean(_b64) });

              if (grp.category === 'extrato' && cfg.autoTriggerOfx !== false) {
                try {
                  const extraction = await parseStatementWithAI({
                    fileBase64: grp.base64,
                    mimeType: 'application/pdf',
                    bankHint: grp.issuerOrBank ? `Banco: ${grp.issuerOrBank}` : undefined,
                  });
                  const ofxContent = generateOfxFile(extraction);
                  const convertedRecord = buildStatementRecordFromExtraction(extraction, ofxContent);
                  const savedStmt = saveStatement({
                    companyId: targetCompId,
                    sourceDocId: createdDoc.id,
                    originalFileName: createdDoc.fileName,
                    fileBase64: grp.base64.length <= 1_800_000 ? grp.base64 : undefined,
                    fileMimeType: 'application/pdf',
                    ...convertedRecord,
                  });
                  updateDocument(createdDoc.id, {
                    ofxStatus: 'done',
                    ofxStatementId: savedStmt.id,
                    ofxError: undefined,
                  });
                  createdDoc.ofxStatus = 'done';
                  createdDoc.ofxStatementId = savedStmt.id;
                  importedStatements.push(savedStmt);
                } catch (ofxErr: any) {
                  updateDocument(createdDoc.id, {
                    ofxStatus: 'error',
                    ofxError: String(ofxErr?.message || 'Falha na conversão automática OFX').slice(0, 240),
                  });
                }
              }
            }
          } else {
            // Single attachment classification
            let textPreview: string | undefined;
            if (
              mimeType.startsWith('text/') ||
              mimeType.includes('xml') ||
              origName.toLowerCase().endsWith('.xml') ||
              origName.toLowerCase().endsWith('.ofx') ||
              origName.toLowerCase().endsWith('.csv') ||
              origName.toLowerCase().endsWith('.txt')
            ) {
              textPreview = buffer.toString('utf-8').slice(0, 12000);
            }

            const aiClass = await classifyDocumentWithAI({
              fileName: origName,
              mimeType,
              base64Data: base64Full.length <= 3_400_000 ? base64Full : undefined,
              textPreview,
            });

            const matchedComp = resolveCompanyForEmail({
              senderEmail,
              subject,
              bodyText,
              fileName: origName,
              detectedCnpj: aiClass.detectedCnpj,
            });
            const targetCompId = matchedComp?.id || 'comp-master';

            const createdDoc = createDocument({
              companyId: targetCompId,
              fileName: origName.slice(0, 200),
              mimeType: mimeType.slice(0, 120),
              fileSize: buffer.length,
              category: aiClass.category,
              status: 'pendente',
              competenceMonth: aiClass.competenceMonth || new Date().toISOString().slice(0, 7),
              documentDate: aiClass.documentDate,
              issuerOrBank: aiClass.issuerOrBank,
              documentNumber: aiClass.documentNumber,
              amount: aiClass.amount,
              detectedCnpj: aiClass.detectedCnpj,
              summary: aiClass.summary,
              aiClassified: aiClass.aiClassified,
              confidence: aiClass.confidence,
              sourceGroupLabel: `Via E-mail · ${senderEmail}`.slice(0, 120),
              notes: `Recebido via e-mail (${senderEmail}) • Assunto: ${subject}`.slice(0, 500),
              uploadedBy: `email:${senderEmail}`.slice(0, 150),
              ofxStatus: aiClass.category === 'extrato' ? 'idle' : undefined,
              fileBase64: base64Full.length <= 3_500_000 ? base64Full : undefined,
            });

            const { fileBase64: _b64, ...meta } = createdDoc;
            importedDocuments.push({ ...meta, hasOriginalFile: Boolean(_b64) });

            if (aiClass.category === 'extrato' && cfg.autoTriggerOfx !== false) {
              try {
                const extraction = await parseStatementWithAI({
                  fileBase64: textPreview ? undefined : base64Full,
                  mimeType,
                  rawText: textPreview,
                  bankHint: aiClass.issuerOrBank ? `Banco: ${aiClass.issuerOrBank}` : undefined,
                });
                const ofxContent = generateOfxFile(extraction);
                const convertedRecord = buildStatementRecordFromExtraction(extraction, ofxContent);
                const savedStmt = saveStatement({
                  companyId: targetCompId,
                  sourceDocId: createdDoc.id,
                  originalFileName: createdDoc.fileName,
                  fileBase64: base64Full.length <= 1_800_000 ? base64Full : undefined,
                  fileMimeType: mimeType,
                  ...convertedRecord,
                });
                updateDocument(createdDoc.id, {
                  ofxStatus: 'done',
                  ofxStatementId: savedStmt.id,
                  ofxError: undefined,
                });
                createdDoc.ofxStatus = 'done';
                createdDoc.ofxStatementId = savedStmt.id;
                importedStatements.push(savedStmt);
              } catch (ofxErr: any) {
                updateDocument(createdDoc.id, {
                  ofxStatus: 'error',
                  ofxError: String(ofxErr?.message || 'Falha na conversão automática OFX').slice(0, 240),
                });
              }
            }
          }
        }

        // Mark seen on IMAP server & record processed UID/Message-ID
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        newlyProcessedKeys.push(uidKey);
        if (msgIdKey) newlyProcessedKeys.push(msgIdKey);
      }

      if (newlyProcessedKeys.length > 0) {
        markEmailKeysProcessed(newlyProcessedKeys);
      }
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }

    const nowIso = new Date().toISOString();
    const summaryMsg =
      importedDocuments.length > 0
        ? `${importedDocuments.length} documento(s) importado(s) de ${cfg.user}${
            importedStatements.length > 0 ? ` (${importedStatements.length} OFX gerado(s) automaticamente)` : ''
          }.`
        : `Caixa ${cfg.user} verificada. Nenhum novo anexo contábil pendente.`;

    saveInboxConfig({
      ...cfg,
      lastCheckedAt: nowIso,
      lastStatus: 'ok',
      lastMessage: summaryMsg,
      lastImportedCount: importedDocuments.length,
      totalImportedCount: (cfg.totalImportedCount || 0) + importedDocuments.length,
    });

    return {
      success: true,
      importedDocuments,
      importedStatements,
      checkedMessages,
      message: summaryMsg,
    };
  } catch (err: any) {
    await client.logout().catch(() => {});
    const friendly = formatFriendlyImapError(err, cfg.user);
    saveInboxConfig({
      ...cfg,
      lastCheckedAt: new Date().toISOString(),
      lastStatus: 'error',
      lastMessage: friendly,
      lastImportedCount: 0,
    });
    return {
      success: false,
      importedDocuments,
      importedStatements,
      checkedMessages,
      message: friendly,
      error: friendly,
    };
  } finally {
    isSyncInProgress = false;
  }
}

export function startInboxBackgroundPoller(): void {
  if (
    process.env.npm_lifecycle_event === 'build' ||
    process.argv.some((a) => a === 'build')
  ) {
    return;
  }
  const g = globalThis as any;
  if (g.__contsuiteInboxPollerStarted) return;
  g.__contsuiteInboxPollerStarted = true;

  // Initial check 8 seconds after boot, then every 60s
  const bootTimer = setTimeout(() => {
    const cfg = getInboxConfig();
    if (cfg.enabled && cfg.pass) {
      void syncEmailInbox({ maxMessages: 15, silentIfUnconfigured: true });
    }
  }, 8000);
  bootTimer.unref?.();

  const pollTimer = setInterval(() => {
    const cfg = getInboxConfig();
    if (!cfg.enabled || !cfg.pass) return;
    const intervalMs = Math.max(30, cfg.pollIntervalSeconds || 60) * 1000;
    const lastMs = cfg.lastCheckedAt ? new Date(cfg.lastCheckedAt).getTime() : 0;
    if (Date.now() - lastMs >= intervalMs - 2000) {
      void syncEmailInbox({ maxMessages: 15, silentIfUnconfigured: true });
    }
  }, 30_000);
  pollTimer.unref?.();
}
