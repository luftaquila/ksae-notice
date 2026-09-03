import { describe, it, expect } from 'vitest';
import {
  BOARDS,
  CATEGORY_COLORS,
  NOTICE_CATEGORIES,
  SUBSCRIPTION_CATEGORIES,
  getBoardCode,
  getBoardLabel,
  getCategoryLabel,
  getPostLabel,
} from '@/lib/constants';

describe('board and category mappings', () => {
  it('maps every board type to its KSAE code', () => {
    expect(getBoardCode('notice')).toBe('J_notice');
    expect(getBoardCode('rule')).toBe('J_rule');
    expect(getBoardCode('result')).toBe('J_result');
    expect(getBoardCode('form')).toBe('J_form');
  });

  it('labels a post by notice category, or by board for the other boards', () => {
    expect(getPostLabel('notice', 'EV')).toBe('EV');
    expect(getPostLabel('notice', null)).toBe('공통');
    expect(getPostLabel('rule', null)).toBe('규정');
    expect(getPostLabel('result', null)).toBe('경기결과');
    expect(getPostLabel('form', null)).toBe('양식');
  });

  it('labels every subscription category', () => {
    expect(getCategoryLabel('notice_A')).toBe('Baja');
    expect(getCategoryLabel('rule')).toBe('규정');
    expect(getCategoryLabel('result')).toBe('경기결과');
    expect(getCategoryLabel('form')).toBe('양식');
  });

  // 게시판을 추가하면 구독 카테고리와 색상도 같이 늘어나야 한다. 빠지면 크롤링은 되는데
  // 아무도 구독할 수 없거나, 칩이 회색으로 떨어진다.
  it('gives every non-notice board a subscription category with the same id', () => {
    const ids = new Set(SUBSCRIPTION_CATEGORIES.map((c) => c.id));
    for (const board of BOARDS) {
      if (board.type === 'notice') continue;
      expect(ids.has(board.type)).toBe(true);
      expect(getBoardLabel(board.type)).toBe(board.label);
    }
  });

  it('has a colour entry for every label a post or subscription can wear', () => {
    for (const cat of SUBSCRIPTION_CATEGORIES) {
      expect(CATEGORY_COLORS[getCategoryLabel(cat.id)], cat.id).toBeDefined();
    }
    for (const label of Object.values(NOTICE_CATEGORIES)) {
      expect(CATEGORY_COLORS[label], label).toBeDefined();
    }
    for (const board of BOARDS) {
      expect(CATEGORY_COLORS[getPostLabel(board.type, null)], board.type).toBeDefined();
    }
  });
});
