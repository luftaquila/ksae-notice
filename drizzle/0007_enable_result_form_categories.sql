-- 경기결과(result)·양식(form) 게시판을 붙이면서 기존 계정에도 두 카테고리를 켠다.
-- 가입 시 기본값이 "전부 켜기"라 그에 맞춘다. 대상은 탈퇴하지 않았고 켜진 카테고리가
-- 하나라도 있는 계정이다 — 전부 끈 계정은 알림을 원치 않는다고 밝힌 것이므로 건너뛴다.
-- 탈퇴 계정은 재가입 동의(signup-consent)가 빠진 카테고리를 채운다.
-- 마이그레이션이므로 배포 후 서버 시작 시 한 번만 실행된다.
INSERT INTO `subscriptions` (`user_id`, `category`, `is_active`)
SELECT `u`.`id`, `c`.`category`, 1
FROM `users` `u`
CROSS JOIN (SELECT 'result' AS `category` UNION ALL SELECT 'form') `c`
WHERE `u`.`deleted_at` IS NULL
  AND EXISTS (
    SELECT 1 FROM `subscriptions` `s`
    WHERE `s`.`user_id` = `u`.`id` AND `s`.`is_active` = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM `subscriptions` `s`
    WHERE `s`.`user_id` = `u`.`id` AND `s`.`category` = `c`.`category`
  );
