# Run application
prod:
    python src/main.py

# Run application (development mode)
dev:
    PYTHONDEVMODE=1 python src/main.py

# Run tests
test:
    PYTHONDEVMODE=1 pytest --durations=5

# Run tests with coverage
test-cov:
    PYTHONDEVMODE=1 pytest --cov

# Run lint and format
lint:
    ruff check --fix
    ruff format

# Run type check
type:
    mypy
