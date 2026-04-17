import { WarrantyCase } from '../types/warranty';

const EXACT_DUPLICATE_WINDOW_DAYS = 7;

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, '').slice(-10);
}

function normalizeEmail(email?: string): string {
  return (email || '').trim().toLowerCase();
}

function wordSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
  );
}

function wordOverlap(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return intersection / Math.max(setA.size, setB.size);
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

export function findExactDuplicates(target: WarrantyCase, allCases: WarrantyCase[]): WarrantyCase[] {
  const targetPhone = normalizePhone(target.customerPhone);
  const targetProduct = target.productName.toLowerCase().trim();

  return allCases.filter(c => {
    if (c.id === target.id) return false;
    const phoneMatch = normalizePhone(c.customerPhone) === targetPhone;
    const productMatch = c.productName.toLowerCase().trim() === targetProduct;
    const withinWindow = daysBetween(c.createdAt, target.createdAt) <= EXACT_DUPLICATE_WINDOW_DAYS;
    return phoneMatch && productMatch && withinWindow;
  });
}

export function findCustomerHistory(phoneOrEmail: string, allCases: WarrantyCase[]): WarrantyCase[] {
  const query = phoneOrEmail.trim().toLowerCase();
  const queryPhone = normalizePhone(query);

  return allCases
    .filter(c => {
      if (normalizePhone(c.customerPhone) === queryPhone && queryPhone.length >= 10) return true;
      if (query.includes('@') && normalizeEmail(c.customerEmail) === query) return true;
      return false;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function scoreDuplicateLikelihood(caseA: WarrantyCase, caseB: WarrantyCase): number {
  let score = 0;

  if (normalizePhone(caseA.customerPhone) === normalizePhone(caseB.customerPhone)) {
    score += 40;
  }

  const emailA = normalizeEmail(caseA.customerEmail);
  const emailB = normalizeEmail(caseB.customerEmail);
  if (emailA && emailB && emailA === emailB) {
    score += 20;
  }

  const prodA = caseA.productName.toLowerCase().trim();
  const prodB = caseB.productName.toLowerCase().trim();
  if (prodA === prodB) {
    score += 20;
  } else if (prodA.includes(prodB) || prodB.includes(prodA)) {
    score += 10;
  }

  const issueOverlap = wordOverlap(caseA.issueDescription, caseB.issueDescription);
  score += Math.round(issueOverlap * 10);

  if (daysBetween(caseA.createdAt, caseB.createdAt) <= 7) {
    score += 10;
  }

  return Math.min(100, score);
}

export interface DuplicateMatch {
  case_: WarrantyCase;
  score: number;
}

export function findPotentialDuplicates(
  target: WarrantyCase,
  allCases: WarrantyCase[],
  threshold: number = 40
): DuplicateMatch[] {
  const phoneIndex = new Map<string, WarrantyCase[]>();
  for (const c of allCases) {
    if (c.id === target.id) continue;
    const phone = normalizePhone(c.customerPhone);
    if (!phoneIndex.has(phone)) phoneIndex.set(phone, []);
    phoneIndex.get(phone)!.push(c);
  }

  const candidates = new Set<WarrantyCase>();
  const targetPhone = normalizePhone(target.customerPhone);
  const phoneCandidates = phoneIndex.get(targetPhone);
  if (phoneCandidates) {
    for (const c of phoneCandidates) candidates.add(c);
  }

  for (const c of allCases) {
    if (c.id === target.id) continue;
    if (candidates.has(c)) continue;
    const emailA = normalizeEmail(target.customerEmail);
    const emailB = normalizeEmail(c.customerEmail);
    if (emailA && emailB && emailA === emailB) {
      candidates.add(c);
    }
  }

  const results: DuplicateMatch[] = [];
  for (const c of candidates) {
    const score = scoreDuplicateLikelihood(target, c);
    if (score >= threshold) {
      results.push({ case_: c, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export interface DuplicateGroup {
  key: string;
  cases: WarrantyCase[];
}

export function findAllDuplicateGroups(allCases: WarrantyCase[], threshold: number = 50): DuplicateGroup[] {
  const phoneIndex = new Map<string, WarrantyCase[]>();
  for (const c of allCases) {
    const phone = normalizePhone(c.customerPhone);
    const product = c.productName.toLowerCase().trim();
    const key = `${phone}|${product}`;
    if (!phoneIndex.has(key)) phoneIndex.set(key, []);
    phoneIndex.get(key)!.push(c);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, cases] of phoneIndex) {
    if (cases.length >= 2) {
      const score = scoreDuplicateLikelihood(cases[0], cases[1]);
      if (score >= threshold) {
        groups.push({ key, cases: cases.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) });
      }
    }
  }

  return groups;
}
