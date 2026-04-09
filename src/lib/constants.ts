export const BOARDS = [
  {
    type: 'notice',
    code: 'J_notice',
    baseUrl: 'https://www.ksae.org/jajak/bbs/index.php',
  },
  {
    type: 'rule',
    code: 'J_rule',
    baseUrl: 'https://www.ksae.org/jajak/bbs/index.php',
  },
] as const;

export type BoardType = (typeof BOARDS)[number]['type'];

export const NOTICE_CATEGORIES: Record<string, string> = {
  Z: '공통',
  A: 'Baja',
  B: 'Formula',
  C: 'EV',
  D: '자율주행',
};

// Reverse mapping: category label -> code
export const NOTICE_CATEGORY_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(NOTICE_CATEGORIES).map(([code, label]) => [label, code]),
);

export const SUBSCRIPTION_CATEGORIES = [
  { id: 'notice_Z', label: '공지 - 공통' },
  { id: 'notice_A', label: '공지 - Baja' },
  { id: 'notice_B', label: '공지 - Formula' },
  { id: 'notice_C', label: '공지 - EV' },
  { id: 'notice_D', label: '공지 - 자율주행' },
  { id: 'rule', label: '규정' },
] as const;

export function getEndOfYear(): string {
  return `${new Date().getFullYear()}-12-31T23:59:59.000Z`;
}
