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

export const CATEGORY_COLORS: Record<string, {
  chip: string;
  chipHover: string;
  filterActive: string;
  filterInactive: string;
  email: { bg: string; text: string };
}> = {
  '공통': {
    chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    chipHover: 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
    filterActive: 'bg-gray-600 text-white dark:bg-gray-500',
    filterInactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
    email: { bg: '#e5e7eb', text: '#374151' },
  },
  'Baja': {
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
    chipHover: 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/30',
    filterActive: 'bg-orange-500 text-white',
    filterInactive: 'bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20',
    email: { bg: '#ffedd5', text: '#c2410c' },
  },
  'Formula': {
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    chipHover: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30',
    filterActive: 'bg-blue-600 text-white',
    filterInactive: 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20',
    email: { bg: '#dbeafe', text: '#1d4ed8' },
  },
  'EV': {
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    chipHover: 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30',
    filterActive: 'bg-purple-600 text-white',
    filterInactive: 'bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20',
    email: { bg: '#f3e8ff', text: '#7e22ce' },
  },
  '자율주행': {
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    chipHover: 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30',
    filterActive: 'bg-rose-500 text-white',
    filterInactive: 'bg-rose-50 text-rose-500 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20',
    email: { bg: '#ffe4e6', text: '#be123c' },
  },
  '규정': {
    chip: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    chipHover: 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30',
    filterActive: 'bg-green-600 text-white',
    filterInactive: 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20',
    email: { bg: '#dcfce7', text: '#15803d' },
  },
};

export function getCategoryLabel(subscriptionId: string): string {
  if (subscriptionId === 'rule') return '규정';
  const code = subscriptionId.replace('notice_', '');
  return NOTICE_CATEGORIES[code] || subscriptionId;
}
