// 구 경로. 카테고리 켬/끔은 "구독" 이 아니라 알림 설정이라 /api/alerts 로 옮겼다.
// 배포 사이에 열려 있던 대시보드가 깨지지 않도록 한 릴리스 동안 그대로 넘겨준다.
export { GET, POST, DELETE } from '../alerts/route';
