// 관리자 화면의 탭들이 같이 보는 자료 모양. 서버 응답(/api/admin/*)을 그대로 옮긴 것이다.

export interface UserInfo {
  id: number;
  email: string;
  name: string | null;
  createdAt: string;
  deletedAt: string | null;
  subscriptionExpiresAt: string | null;
  alerts: { category: string; isActive: number }[];
  alertsPausedAt: string | null;
  emailsSent: number;
  emailsSkipped: number;
}

export type UserAction =
  | 'enable_alert'
  | 'disable_alert'
  | 'enable_all_alerts'
  | 'disable_all_alerts'
  | 'grant_year'
  | 'revoke_period'
  | 'delete';

export interface FailedEmail {
  id: number;
  userId: number;
  email: string;
  error: string | null;
  sentAt: string;
}

export interface CrawlLog {
  id: number;
  boardType: string;
  startedAt: string;
  finishedAt: string | null;
  newPostsCount: number;
  status: string;
}

export interface AdminStats {
  totalUsers: number;
  deletedUsers: number;
  seats: number;
  recipients: number;
  totalPosts: number;
  emails: {
    totalSent: number;
    totalFailed: number;
    totalSkipped: number;
    todaySent: number;
    todaySkipped: number;
    todayFailed: number;
    recentFailed: FailedEmail[];
  };
  recentCrawls: CrawlLog[];
}

export interface Settings {
  maxSubscribers: string;
  registrationOpen: string;
  maxEmailsPerUserPerDay: string;
  subscriptionPrice: string;
  bizName: string;
  bizOwner: string;
  bizRegNo: string;
  bizMailOrderNo: string;
  bizAddress: string;
  bizTel: string;
  bizEmail: string;
}

export interface Payment {
  orderId: string;
  userEmail: string;
  goodsName: string;
  targetYear: number;
  amount: number;
  status: string;
  method: string | null;
  grantedFrom: string | null;
  grantedTo: string | null;
  failReason: string | null;
  cancelReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  cancelledAt: string | null;
}
