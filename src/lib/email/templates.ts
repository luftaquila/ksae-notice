import { CATEGORY_COLORS } from '../constants';

interface PostInfo {
  id: number;
  title: string;
  category: string | null;
  date: string;
  boardType: string;
}

function getBaseStyle() {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a365d; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 24px; }
    .post-item { display: block; border-left: 4px solid #3182ce; padding: 12px 16px; margin-bottom: 12px; background: #f7fafc; text-decoration: none; color: inherit; }
    .post-item:hover { background: #edf2f7; }
    .post-item .category { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-bottom: 4px; }
    .post-item .title { font-size: 15px; color: #1a202c; font-weight: 600; }
    .post-item .date { font-size: 12px; color: #a0aec0; margin-top: 4px; }
    .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; padding: 10px 24px; background: #3182ce; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; }
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEFAULT_EMAIL_COLORS = { bg: '#e5e7eb', text: '#374151' };

export function newPostNotification(postsByCategory: PostInfo[], siteUrl: string): string {
  const postsHtml = postsByCategory
    .map((post) => {
      const categoryLabel = post.boardType === 'rule' ? '규정' : (post.category || '공통');
      const colors = CATEGORY_COLORS[categoryLabel]?.email || DEFAULT_EMAIL_COLORS;
      const postUrl = `${siteUrl}/go/${post.id}`;
      return `
        <a href="${escapeHtml(postUrl)}" class="post-item">
          <span class="category" style="background: ${colors.bg}; color: ${colors.text};">${escapeHtml(categoryLabel)}</span>
          <div class="title">${escapeHtml(post.title)}</div>
          <div class="date">${escapeHtml(post.date)}</div>
        </a>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><style>${getBaseStyle()}</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>KSAE 공지봇 - 새 게시글 알림</h1>
    </div>
    <div class="content">
      <p style="color: #4a5568;">구독 중인 카테고리에 새 게시글이 등록되었습니다.</p>
      ${postsHtml}
      <p style="text-align: center; margin-top: 24px;">
        <a href="${siteUrl}/dashboard" class="btn" style="color: #ffffff;">구독 설정 관리</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function renewalReminder(userName: string, siteUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><style>${getBaseStyle()}</style></head>
<body>
  <div class="container">
    <div class="header">
      <h1>KSAE 공지봇 구독 갱신 안내</h1>
    </div>
    <div class="content">
      <p style="color: #4a5568;">안녕하세요${userName ? `, ${escapeHtml(userName)}` : ''}님.</p>
      <p style="color: #4a5568;">현재 구독 중인 KSAE 공지봇 서비스가 <strong>12월 31일</strong>에 만료됩니다.</p>
      <p style="color: #4a5568;">계속 알림을 받으시려면 아래 버튼을 클릭하여 구독을 갱신해 주세요.</p>
      <p style="text-align: center; margin-top: 24px;">
        <a href="${siteUrl}/dashboard" class="btn">구독 갱신하기</a>
      </p>
      <p style="color: #a0aec0; font-size: 13px; margin-top: 16px;">갱신하지 않으면 12월 31일 이후 알림이 중단됩니다.</p>
    </div>
  </div>
</body>
</html>`;
}
