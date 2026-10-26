-- 스펙트럼용. 언어 없는 repo 까지 세야 합이 전체와 맞는다.
SELECT coalesce(language, '') AS key, count(*) AS n
FROM starred
GROUP BY language
ORDER BY n DESC
