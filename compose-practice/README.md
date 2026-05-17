# Docker Compose Practice

Docker Compose는 여러 컨테이너를 하나의 YAML 파일로 같이 실행하고 관리하는 도구입니다.
이 실습은 `nginx`, `postgres`, `adminer` 컨테이너를 한 번에 실행합니다.

## 실행

프로젝트 루트에서 실행합니다.

```powershell
docker compose -f docker-compose.practice.yml up -d
```

브라우저에서 확인합니다.

- 웹 페이지: http://localhost:8080
- DB 관리 화면: http://localhost:8081

Adminer 접속 정보:

- System: `PostgreSQL`
- Server: `db`
- Username: `practice_user`
- Password: `practice_password`
- Database: `practice`

## 상태 확인

```powershell
docker compose -f docker-compose.practice.yml ps
docker compose -f docker-compose.practice.yml logs web
docker compose -f docker-compose.practice.yml logs db
```

## DB에 직접 접속

```powershell
docker compose -f docker-compose.practice.yml exec db psql -U practice_user -d practice
```

접속 후 실행해볼 SQL:

```sql
SELECT * FROM todos;
INSERT INTO todos (title) VALUES ('Compose로 DB 데이터 추가하기');
SELECT * FROM todos;
```

종료는 `\q` 입니다.

## 정리

컨테이너만 종료하고 삭제:

```powershell
docker compose -f docker-compose.practice.yml down
```

DB 데이터 볼륨까지 삭제:

```powershell
docker compose -f docker-compose.practice.yml down -v
```

## 파일 설명

- `docker-compose.practice.yml`: 실행할 서비스 전체 정의
- `index.html`: nginx가 보여주는 정적 페이지
- `nginx.conf`: nginx 설정
- `init.sql`: Postgres가 처음 생성될 때 실행하는 초기 SQL

## Compose 핵심 문법

- `services`: 실행할 컨테이너 목록
- `image`: 사용할 Docker 이미지
- `ports`: 내 컴퓨터 포트와 컨테이너 포트 연결
- `volumes`: 파일 또는 데이터를 컨테이너에 연결
- `environment`: 컨테이너 환경변수
- `depends_on`: 서비스 실행 순서 지정
- `healthcheck`: 컨테이너가 실제로 준비됐는지 검사
- `restart`: 컨테이너 재시작 정책
