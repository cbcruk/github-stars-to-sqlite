-- 언어 이름과 같은 토픽은 뺀다. 'javascript' 칩과 JavaScript 언어 필터가 같은
-- 자리를 두고 다투기 때문이다. 이름 비교뿐이라 판단이 들어가지 않는다.
SELECT t.topic AS key, count(*) AS n
FROM topic t
WHERE lower(t.topic) NOT IN (SELECT lower(language) FROM starred WHERE language IS NOT NULL)
GROUP BY t.topic
ORDER BY n DESC, t.topic ASC
LIMIT :limit::integer
