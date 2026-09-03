// 크롤링하는 게시판. 순서가 곧 목록 정렬 순서다 (고정글 우선 정렬에서 게시판 사이 순서).
// 공지만 게시판 안에 카테고리가 있고, 나머지는 게시판 자체가 구독 단위다 —
// 구독 카테고리 ID 가 게시판 type 과 같다.
export const BOARDS = [
  { type: 'notice', code: 'J_notice', label: '공지' },
  { type: 'rule', code: 'J_rule', label: '규정' },
  { type: 'result', code: 'J_result', label: '경기결과' },
  { type: 'form', code: 'J_form', label: '양식' },
] as const;

export type BoardType = (typeof BOARDS)[number]['type'];

function findBoard(boardType: string) {
  return BOARDS.find((b) => b.type === boardType);
}

// KSAE 게시판 URL 의 code= 값. DB 의 board_type 은 크롤러가 BOARDS 에서 쓴 값이라
// 못 찾는 일은 없지만, 타입은 string 이므로 첫 게시판으로 접는다.
export function getBoardCode(boardType: string): string {
  return findBoard(boardType)?.code ?? BOARDS[0].code;
}

export function getBoardLabel(boardType: string): string {
  return findBoard(boardType)?.label ?? boardType;
}

// 게시글 한 건이 화면·메일에서 달고 나오는 분류 라벨. 공지는 게시판 안의
// 카테고리를, 다른 게시판은 게시판 이름을 쓴다. CATEGORY_COLORS 의 키와 같다.
export function getPostLabel(boardType: string, category: string | null): string {
  if (boardType === 'notice') return category || '공통';
  return getBoardLabel(boardType);
}

// 고지 내용을 고치면 날짜를 올린다. 기존 동의와 구분되는 유일한 표식이다.
export const PRIVACY_CONSENT_VERSION = '2026-08-19';

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
  { id: 'result', label: '경기결과' },
  { id: 'form', label: '양식' },
] as const;

export const CATEGORY_COLORS: Record<string, {
  chip: string;
  chipHover: string;
  filterActive: string;
  filterInactive: string;
  email: { bg: string; text: string };
}> = {
  '공통': {
    chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    chipHover: 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:active:bg-gray-600',
    filterActive: 'bg-gray-600 text-white dark:bg-gray-500',
    filterInactive: 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-700',
    email: { bg: '#e5e7eb', text: '#374151' },
  },
  'Baja': {
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
    chipHover: 'bg-orange-100 text-orange-700 hover:bg-orange-200 active:bg-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/30 dark:active:bg-orange-500/30',
    filterActive: 'bg-orange-500 text-white',
    filterInactive: 'bg-orange-50 text-orange-600 hover:bg-orange-100 active:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20 dark:active:bg-orange-500/20',
    email: { bg: '#ffedd5', text: '#c2410c' },
  },
  'Formula': {
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    chipHover: 'bg-blue-100 text-blue-700 hover:bg-blue-200 active:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30 dark:active:bg-blue-500/30',
    filterActive: 'bg-blue-600 text-white',
    filterInactive: 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 dark:active:bg-blue-500/20',
    email: { bg: '#dbeafe', text: '#1d4ed8' },
  },
  'EV': {
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    chipHover: 'bg-purple-100 text-purple-700 hover:bg-purple-200 active:bg-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30 dark:active:bg-purple-500/30',
    filterActive: 'bg-purple-600 text-white',
    filterInactive: 'bg-purple-50 text-purple-600 hover:bg-purple-100 active:bg-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20 dark:active:bg-purple-500/20',
    email: { bg: '#f3e8ff', text: '#7e22ce' },
  },
  '자율주행': {
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    chipHover: 'bg-rose-100 text-rose-700 hover:bg-rose-200 active:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30 dark:active:bg-rose-500/30',
    filterActive: 'bg-rose-500 text-white',
    filterInactive: 'bg-rose-50 text-rose-500 hover:bg-rose-100 active:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 dark:active:bg-rose-500/20',
    email: { bg: '#ffe4e6', text: '#be123c' },
  },
  '규정': {
    chip: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    chipHover: 'bg-green-100 text-green-700 hover:bg-green-200 active:bg-green-200 dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/30 dark:active:bg-green-500/30',
    filterActive: 'bg-green-600 text-white',
    filterInactive: 'bg-green-50 text-green-600 hover:bg-green-100 active:bg-green-100 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20 dark:active:bg-green-500/20',
    email: { bg: '#dcfce7', text: '#15803d' },
  },
  '경기결과': {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400',
    chipHover: 'bg-amber-100 text-amber-800 hover:bg-amber-200 active:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/30 dark:active:bg-amber-500/30',
    filterActive: 'bg-amber-500 text-white',
    filterInactive: 'bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 dark:active:bg-amber-500/20',
    email: { bg: '#fef3c7', text: '#92400e' },
  },
  '양식': {
    chip: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',
    chipHover: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200 active:bg-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-400 dark:hover:bg-cyan-500/30 dark:active:bg-cyan-500/30',
    filterActive: 'bg-cyan-600 text-white',
    filterInactive: 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100 active:bg-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-400 dark:hover:bg-cyan-500/20 dark:active:bg-cyan-500/20',
    email: { bg: '#cffafe', text: '#0e7490' },
  },
};

// 구독 카테고리 ID → 화면 라벨 (CATEGORY_COLORS 의 키). notice_X 는 공지 카테고리,
// 나머지는 게시판 type 그대로다.
export function getCategoryLabel(subscriptionId: string): string {
  if (subscriptionId.startsWith('notice_')) {
    const code = subscriptionId.slice('notice_'.length);
    return NOTICE_CATEGORIES[code] || subscriptionId;
  }
  return getBoardLabel(subscriptionId);
}

// 회원 탈퇴 확인 문구. 서버가 이 값을 요구하고 화면이 이 값을 안내한다.
export const ACCOUNT_DELETE_CONFIRMATION = '회원탈퇴';
