SELECT 'CREATE DATABASE clartk_runtime'
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datname = 'clartk_runtime'
)\gexec

SELECT 'CREATE DATABASE clartk_dev'
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datname = 'clartk_dev'
)\gexec
