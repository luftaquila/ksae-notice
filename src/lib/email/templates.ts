import { SUBSCRIPTION_CATEGORIES } from '../constants';

interface PostInfo {
  title: string;
  category: string | null;
  date: string;
  url: string;
  boardType: string;
}

function getBaseStyle() {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a365d; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { padding: 24px; }
    .post-item { border-left: 4px solid #3182ce; padding: 12px 16px; margin-bottom: 12px; background: #f7fafc; }
    .post-item .category { display: inline-block; font-size: 12px; color: #718096; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; margin-bottom: 4px; }
    .post-item .title { font-size: 15px; color: #1a202c; text-decoration: none; font-weight: 600; }
    .post-item .title:hover { color: #3182ce; }
    .post-item .date { font-size: 12px; color: #a0aec0; margin-top: 4px; }
    .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; padding: 10px 24px; background: #3182ce; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; }
  `;
}

export function newPostNotification(postsByCategory: PostInfo[], siteUrl: string): string {
  const postsHtml = postsByCategory
    .map((post) => {
      const boardLabel = post.boardType === 'notice' ? '공지' : '규정';
      const categoryLabel = post.category ? `${boardLabel} - ${post.category}` : boardLabel;
      return `
        <div class="post-item">
          <span class="category">${categoryLabel}</span>
          <div><a href="${post.url}" class="title">${post.title}</a></div>
          <div class="date">${post.date}</div>
        </div>
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
        <a href="${siteUrl}/dashboard" class="btn">구독 설정 관리</a>
      </p>
    </div>
    <div class="footer">
      <p>이 메일은 KSAE 공지봇에서 발송되었습니다.</p>
      <p><a href="${siteUrl}/dashboard">구독 해제</a></p>
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
      <p style="color: #4a5568;">안녕하세요${userName ? `, ${userName}` : ''}님.</p>
      <p style="color: #4a5568;">현재 구독 중인 KSAE 공지봇 서비스가 <strong>12월 31일</strong>에 만료됩니다.</p>
      <p style="color: #4a5568;">계속 알림을 받으시려면 아래 버튼을 클릭하여 구독을 갱신해 주세요.</p>
      <p style="text-align: center; margin-top: 24px;">
        <a href="${siteUrl}/dashboard" class="btn">구독 갱신하기</a>
      </p>
      <p style="color: #a0aec0; font-size: 13px; margin-top: 16px;">갱신하지 않으면 12월 31일 이후 알림이 중단됩니다.</p>
    </div>
    <div class="footer">
      <p>이 메일은 KSAE 공지봇에서 발송되었습니다.</p>
    </div>
  </div>
</body>
</html>`;
}
