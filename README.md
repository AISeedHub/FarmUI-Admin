# AISEED 파이썬 프로젝트 템플릿

[한국어](./README.md) | [English](./README_EN.md)

## 소개

AI 회사인 AISEED는 파이썬 프로젝트가 많습니다.  
이전과 달리, 연구를 넘어 실제 제품까지 만들기 때문에 유지보수가 필요합니다.

우리는 앞으로 **코드 작성** 이외에도 **코드 관리**까지 힘써야 한다는 뜻입니다.  
하지만 프로젝트 유지보수는 쉽지 않습니다.

- 코드 컨벤션 통일
- 프로젝트 구조 설계
- 테스트 코드 작성
- 가상 환경 및 의존성 관리
- ...

신규 프로젝트를 시작할 때, 혹은 새로운 인력이 프로젝트에 투입됐을 때, 매번 위와 같은 요소들을 설명하고 설정하는 일은 비효율적입니다.

그래서 전사 차원에서 사용할 일관된 템플릿을 만들었습니다.

## 구성요소

템플릿에 사용된 기본적인 구성 요소는 다음과 같습니다.

- [uv](https://github.com/astral-sh/uv) - 의존성
- [ruff](https://docs.astral.sh/ruff/) - 코드 규칙 및 포맷
- [mypy](https://mypy.readthedocs.io/en/stable/) - 타입 지원
- [pytest](https://docs.pytest.org/) - 테스트 코드
- [pre-commit](https://pre-commit.com/) - git commit 작업 시 사전 작업 수행
- [just](https://github.com/casey/just) - 단축 스크립트 실행

## 프로젝트 구조

```
src/                # 소스 코드
├── config/         # 설정 관리
├── greeting/       # 예시 모듈
└── main.py         # 애플리케이션 진입점
tests/              # 테스트 코드 (src/ 구조를 미러링)
└── greeting/
notebooks/          # Jupyter 노트북
ruff.toml           # Ruff 설정
mypy.ini            # mypy 설정
pytest.ini          # pytest 설정
.coveragerc         # 커버리지 설정
```

## 시작하기
### 프로젝트 설정

- Github에서 이 템플릿으로 Repository를 생성한 후 Clone 해주세요.
  ![Github Repository's Use this template](./assets/use-this-template.jpeg)
- 프로젝트 폴더 안에 있는 `pyproject.toml` 파일의 `name`, `version`, `description`, `authors`를 각자의 프로젝트에 맞게 수정해주세요.
- 프로젝트 루트 경로에서 다음 스크립트를 실행해주세요.
  ```bash
  $ uv sync
  $ pre-commit install
  # pre-commit 설치 오류가 발생했다면 파이썬 가상 환경이 활성화되지 않았을 가능성이 큽니다.
  # 터미널을 다시 시작해보세요.
  ```

### 환경변수 설정
`.env.sample`를 참고해서 환경변수 파일인 `.env`를 만들어주세요.

```bash
$ cp .env.sample .env
```

## 프로젝트 지침

### 의존성 관리

의존성은 `pip` 대신 `uv`로 관리합니다.  

> [!IMPORTANT]  
> 개발에 필요한 패키지와 제품에 필요한 패키지를 구분해주세요.

```bash
# install production dependency
$ uv add numpy

# uninstall production dependency
$ uv remove numpy

# install development dependency
$ uv add --dev pytest

# uninstall development dependency
$ uv remove --dev pytest
```

### 단축 스크립트

`justfile`에 자주 사용하는 명령어가 정의되어 있습니다.  
`uv`에서 스크립트를 지원하면 마이그레이션할 예정입니다. ([관련 이슈](https://github.com/astral-sh/uv/issues/5903))

```bash
$ just prod       # 애플리케이션 실행
$ just dev        # 애플리케이션 실행 (개발 모드)
$ just test       # 테스트 실행
$ just test-cov   # 테스트 커버리지 실행
$ just lint       # 린트 및 포맷
$ just type       # 타입 체크
```

### 타입 체크

`mypy`로 타입 오류가 발생한 지점을 찾습니다.

```bash
$ just type
```

### Lint

`ruff`로 코드 컨벤션에 문제가 있는 지점을 찾습니다.

```bash
$ just lint
```

### 테스트 실행

`pytest`로 `tests/` 폴더에 있는 테스트를 실행합니다.

```bash
# run test
$ just test

# run test with coverage
$ just test-cov
```

> [!NOTE]
> 테스트 커버리지는 최소 **70%**를 유지해야 합니다. 커버리지가 70% 미만이면 테스트가 실패합니다.

**테스트 코드 작성**은 몹시 어렵고 방대한 주제이기 때문에 테스트 코드 작성법에 대해선 아직 다루지 않습니다.
대신, 다른 구성원이 쉽게 코드를 파악할 수 있도록 **코드 사용법**을 위주로 작성해주시기 바랍니다.

### Git

작업 내역을 `commit`할 때 `pre-commit`을 이용해 변경된 코드를 검사합니다.
커밋하기 전에 `ruff`, `mypy`, `pytest`로 코드 컨벤션, 타이핑, 테스트에 문제가 없는지 확인합니다.

#### 커밋 메시지 자동 변환

브랜치명에 Jira 이슈 번호(`ABC-123` 형태)가 포함되어 있으면, 커밋 메시지에 자동으로 이슈 번호가 추가됩니다.

```
# 브랜치: feature/JIRA-123
$ git commit -m "로그인 기능 구현"
# → [JIRA-123] 로그인 기능 구현
```

## 기타

### 템플릿 변경사항 반영

템플릿에 새로운 변경사항이 생겼을 때, 기존 프로젝트에 반영할 수 있습니다.

```bash
# 템플릿 저장소를 remote로 추가 (최초 1회)
$ git remote add template <템플릿 저장소 URL>

# 변경사항 가져오기
$ git fetch template
$ git merge template/main --allow-unrelated-histories
```

충돌이 발생하면 프로젝트에 맞게 해결 후 커밋해주세요.

### 파이썬 버전 변경

1. `.python-version`에서 원하는 버전으로 수정

   (타겟 버전은 `pyproject.toml`의 `requires-python`을 수정)

2. sync 스크립트 실행

   ```bash
   $ uv sync
   ```

### PyTorch 설치
일반적인 파이썬 패키지들은 **PyPI**에서 호스팅됩니다. 반면, `pytorch`는 별도의 인덱스를 따로 갖고 있습니다.  
게다가 CPU 전용 빌드, CUDA 버전별 빌드 등 같은 패키지더라도 빌드가 여러 개이기 때문에 `uv`에서 `pytorch`를 설치하려면 어떤 빌드를 패키지로 설치할지 명시해줘야 합니다.

다음은 Linux와 Windows 환경에서는 CUDA 12.6 빌드를, macOS 환경에서는 CPU 빌드를 사용하는 예시입니다.  
만약 다른 버전의 CUDA를 사용하고 싶다면 숫자를 바꿔주시면 됩니다. (예: cu126 -> cu128)

```toml
# pyproject.toml

[tool.uv.sources]
torch = [
  { index = "pytorch-cu126", marker = "sys_platform != 'darwin'" },
  { index = "pytorch-cpu", marker = "sys_platform == 'darwin'" },
]
torchvision = [
  { index = "pytorch-cu126", marker = "sys_platform != 'darwin'" },
  { index = "pytorch-cpu", marker = "sys_platform == 'darwin'" },
]

[[tool.uv.index]]
name = "pytorch-cu126"
url = "https://download.pytorch.org/whl/cu126"
explicit = true

[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true
```

설정 이후 패키지를 설치해주시면 원하는 빌드로 설치가 완료됩니다.

```bash
uv add torch torchvision
```