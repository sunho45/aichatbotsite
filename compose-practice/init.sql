CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO todos (title, done) VALUES
    ('Docker Compose 파일 읽기', TRUE),
    ('nginx, postgres, adminer 같이 실행하기', FALSE),
    ('볼륨으로 DB 데이터 유지 확인하기', FALSE);
