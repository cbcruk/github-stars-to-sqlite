SELECT language AS key, count(*) AS n
FROM starred
WHERE language IS NOT NULL
GROUP BY language
ORDER BY n DESC
LIMIT 20
