-- search.sql 과 같은 조건. 고칠 때는 두 파일을 같이 고친다.
WITH raw AS (
  SELECT :q::text AS q, :lang::text AS lang, :topic::text AS topic
), input AS (
  SELECT q, '%' || q || '%' AS pat, lang, topic FROM raw
)
SELECT count(*) AS n
FROM starred s, input i
WHERE (i.q = '' OR s.full_name LIKE i.pat OR s.description LIKE i.pat OR s.owner LIKE i.pat)
  AND (i.lang = '' OR s.language = i.lang)
  AND (i.topic = '' OR EXISTS (
        SELECT 1 FROM topic t WHERE t.repo_id = s.repo_id AND t.topic = i.topic))
