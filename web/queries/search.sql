WITH raw AS (
  SELECT :q::text AS q, :lang::text AS lang, :topic::text AS topic, :sort::text AS sort
), input AS (
  SELECT q, '%' || q || '%' AS pat, lang, topic, sort FROM raw
)
SELECT s.full_name, s.url, s.owner, s.description, s.language, s.stars,
       s.archived, s.starred_at,
       (SELECT group_concat(t.topic, ' ')
          FROM topic t WHERE t.repo_id = s.repo_id) AS topic_list
FROM starred s, input i
WHERE (i.q = '' OR s.full_name LIKE i.pat OR s.description LIKE i.pat OR s.owner LIKE i.pat)
  AND (i.lang = '' OR s.language = i.lang)
  AND (i.topic = '' OR EXISTS (
        SELECT 1 FROM topic t WHERE t.repo_id = s.repo_id AND t.topic = i.topic))
ORDER BY
  CASE i.sort WHEN 'recent' THEN s.starred_at END DESC,
  CASE i.sort WHEN 'name' THEN lower(s.full_name) END ASC,
  s.stars DESC
LIMIT :limit::integer
