import re
import subprocess
import sys

ISSUE_PATTERN = re.compile(r"[A-Z]+-\d+")


def get_current_branch() -> str:
    return subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def extract_issue_number(branch: str) -> str | None:
    match = ISSUE_PATTERN.search(branch)
    return match.group() if match else None


def update_commit_message() -> None:
    commit_file = sys.argv[1]
    branch = get_current_branch()

    issue_number = extract_issue_number(branch)
    if issue_number is None:
        return

    with open(commit_file, "r+") as f:
        commit_message = f.read()

        # 이미 이슈 번호가 포함된 경우 중복 방지
        if issue_number in commit_message:
            return

        f.seek(0, 0)
        f.write(f"[{issue_number}] {commit_message}")


update_commit_message()
