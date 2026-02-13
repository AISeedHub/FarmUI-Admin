import sys

from config.core import get_config
from greeting.greeting_message import get_greeting_message


def main() -> None:
    app_config = get_config()

    greeting_message = get_greeting_message(app_config.company_name)

    sys.stdout.write(greeting_message)


if __name__ == "__main__":
    main()
