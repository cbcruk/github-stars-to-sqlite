-- 적재 스키마는 느슨하게 두고, 안정된 질의 패턴만 뷰로 굳힌다.
-- 뷰는 언제든 DROP/재정의 가능하고 재적재가 필요 없다.
--
-- html_url 계열은 적재 때 지운다(full_name 에서 복원되므로). 복원은 여기서 한다.

CREATE VIEW IF NOT EXISTS starred AS
SELECT
  s.repo_id,
  s.full_name,
  'https://github.com/' || s.full_name              AS url,
  datetime(s.starred_at, 'unixepoch')               AS starred_at,
  json_extract(s.data, '$.owner.login')             AS owner,
  json_extract(s.data, '$.description')             AS description,
  json_extract(s.data, '$.language')                AS language,
  json_extract(s.data, '$.stargazers_count')        AS stars,
  json_extract(s.data, '$.forks_count')             AS forks,
  json_extract(s.data, '$.open_issues_count')       AS open_issues,
  json_extract(s.data, '$.license.spdx_id')         AS license,
  json_extract(s.data, '$.homepage')                AS homepage,
  json_extract(s.data, '$.archived')                AS archived,
  json_extract(s.data, '$.fork')                    AS is_fork,
  json_extract(s.data, '$.size')                    AS size_kb,
  date(json_extract(s.data, '$.created_at'))        AS repo_created,
  date(json_extract(s.data, '$.pushed_at'))         AS last_push,
  s.first_sync,
  s.last_sync
FROM star s
WHERE s.unstarred_sync IS NULL;

-- 뺀 별표. row 는 지우지 않으므로 언제 무엇이 사라졌는지 남는다.
CREATE VIEW IF NOT EXISTS unstarred AS
SELECT
  s.repo_id,
  s.full_name,
  datetime(s.starred_at, 'unixepoch')      AS starred_at,
  datetime(y.finished_at, 'unixepoch')     AS noticed_at,
  json_extract(s.data, '$.language')       AS language,
  json_extract(s.data, '$.description')    AS description
FROM star s
JOIN sync y ON y.id = s.unstarred_sync
WHERE s.unstarred_sync IS NOT NULL;

-- topics 는 배열이라 별도 뷰로 편다. GROUP BY 로 태그 분포를 바로 낼 수 있다.
CREATE VIEW IF NOT EXISTS topic AS
SELECT
  s.repo_id,
  s.full_name,
  j.value AS topic
FROM star s, json_each(s.data, '$.topics') j
WHERE s.unstarred_sync IS NULL;
