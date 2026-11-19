import { Company } from '../types';

export const MASTER_ADMIN_EMAILS = [
  'rodrigobento1979@gmail.com',
  'contsuitesistemas@gmail.com',
];

export function isMasterUser(
  user?: { email?: string | null; role?: string | null } | null
): boolean {
  if (!user?.email) return false;
  const norm = user.email.toLowerCase().trim();
  return MASTER_ADMIN_EMAILS.includes(norm);
}

export function filterCompaniesForUser(
  companies: Company[],
  user?: { id?: string | null; email?: string | null; companyId?: string | null } | null
): Company[] {
  if (!user) return [];
  if (isMasterUser(user)) return companies;

  const normEmail = (user.email || '').toLowerCase().trim();
  return companies.filter((c) => {
    if (!c) return false;
    if (user.companyId && c.id === user.companyId) return true;
    if (user.id && c.createdByUserId === user.id) return true;
    if (normEmail && c.createdByEmail?.toLowerCase().trim() === normEmail) return true;
    return false;
  });
}
