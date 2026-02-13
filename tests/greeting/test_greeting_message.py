from greeting.greeting_message import get_greeting_message


def test_환영():
    # given
    word = "World"

    # when
    result = get_greeting_message(word)

    # then
    assert result == "Hello, World"
