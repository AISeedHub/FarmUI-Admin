# AISEED Python Project Template

[한국어](./README.md) | [English](./README_EN.md)

## Introduction

AISEED, an AI company, has many Python projects.  
Unlike before, we need maintenance since we're building actual products beyond just research.

This means we need to focus on **code management** as well as **code writing**.  
However, project maintenance is not easy.

- Code convention unification
- Project structure design
- Test code writing
- Virtual environment and dependency management
- ...

It's inefficient to explain and configure these elements every time when starting a new project or when new personnel join a project.

Therefore, we've created a consistent template for company-wide use.

## Components

The basic components used in this template are as follows:

- [uv](https://github.com/astral-sh/uv) - Dependencies
- [ruff](https://docs.astral.sh/ruff/) - Code rules and formatting
- [mypy](https://mypy.readthedocs.io/en/stable/) - Type support
- [pytest](https://docs.pytest.org/) - Test code
- [pre-commit](https://pre-commit.com/) - Perform pre-tasks during git commit operations
- [just](https://github.com/casey/just) - Task runner for shortcut scripts

## Project Structure

```
src/                # Source code
├── config/         # Configuration management
├── greeting/       # Example module
└── main.py         # Application entry point
tests/              # Test code (mirrors src/ structure)
└── greeting/
notebooks/          # Jupyter notebooks
ruff.toml           # Ruff config
mypy.ini            # mypy config
pytest.ini          # pytest config
.coveragerc         # Coverage config
```

## Getting Started

### Project Setup

- Create a repository using this template on Github and clone it.
  ![Github Repository's Use this template](./assets/use-this-template.jpeg)
- Modify the `name`, `version`, `description`, and `authors` in the `pyproject.toml` file in the project folder according to your project.
- Run the following script in the project root directory:
  ```bash
  $ uv sync
  $ pre-commit install
  # If a pre-commit installation error occurs, it's likely that the Python virtual environment is not activated.
  # Try restarting the terminal.
  ```

### Environment Variables Setup
Create an environment variable file `.env` by referring to `.env.sample`.

```bash
$ cp .env.sample .env
```

## Project Guidelines

### Dependency Management

Dependencies are managed with `uv` instead of `pip`.  

> [!IMPORTANT]  
> Please distinguish between packages needed for development and packages needed for production.

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

### Shortcut Scripts

Frequently used commands are defined in the `justfile`.  
Will be migrated when `uv` supports scripts. ([Related issue](https://github.com/astral-sh/uv/issues/5903))

```bash
$ just prod       # Run application
$ just dev        # Run application (development mode)
$ just test       # Run tests
$ just test-cov   # Run tests with coverage
$ just lint       # Run lint and format
$ just type       # Run type check
```

### Type Check

Find points where type errors occur with `mypy`.

```bash
$ just type
```

### Lint

Find points with code convention issues using `ruff`.

```bash
$ just lint
```

### Running Tests

Run tests in the `tests/` folder with `pytest`.

```bash
# run test
$ just test

# run test with coverage
$ just test-cov
```

> [!NOTE]
> Test coverage must be maintained at a minimum of **70%**. Tests will fail if coverage falls below 70%.

**Writing test code** is a very difficult and extensive topic, so we don't cover how to write test code yet.
Instead, please write mainly **code usage** so that other members can easily understand the code.

### Git

When `commit`ting work history, use `pre-commit` to inspect changed code.
Before committing, check for issues with code conventions, typing, and tests using `ruff`, `mypy`, and `pytest`.

#### Automatic Commit Message Formatting

If the branch name contains a Jira issue number (e.g. `ABC-123`), it will be automatically prepended to the commit message.

```
# branch: feature/JIRA-123
$ git commit -m "Implement login feature"
# → [JIRA-123] Implement login feature
```

## Miscellaneous

### Syncing Template Changes

When the template has new changes, you can apply them to your existing project.

```bash
# Add the template repository as a remote (once)
$ git remote add template <TEMPLATE_REPO_URL>

# Fetch and merge changes
$ git fetch template
$ git merge template/main --allow-unrelated-histories
```

If conflicts occur, resolve them according to your project and commit.

### Changing Python Version

1. Modify to the desired version in `.python-version`

   (Modify `requires-python` in `pyproject.toml` for the target version)

2. Run sync script

   ```bash
   $ uv sync
   ```

### PyTorch Installation
General Python packages are hosted on **PyPI**. On the other hand, `pytorch` has its own separate index.  
Moreover, since there are multiple builds for the same package such as CPU-only builds and CUDA version-specific builds, you need to specify which build to install as a package when installing `pytorch` with `uv`.

The following is an example of using CUDA 12.6 build for Linux and Windows environments, and CPU build for macOS environment.  
If you want to use a different version of CUDA, just change the numbers. (e.g., cu126 -> cu128)

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

After configuration, install the packages and the installation will be completed with the desired build.

```bash
uv add torch torchvision
```
