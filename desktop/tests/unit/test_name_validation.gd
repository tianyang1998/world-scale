extends GdUnitTestSuite

func test_valid_name_plain() -> void:
	assert_bool(TitleScreen.is_valid_name("Tianyang")).is_true()

func test_valid_name_with_hyphen_apostrophe_dot() -> void:
	assert_bool(TitleScreen.is_valid_name("O'Brien-Jr.")).is_true()

func test_invalid_name_too_short() -> void:
	assert_bool(TitleScreen.is_valid_name("A")).is_false()

func test_invalid_name_too_long() -> void:
	assert_bool(TitleScreen.is_valid_name("A".repeat(31))).is_false()

func test_invalid_name_disallowed_chars() -> void:
	assert_bool(TitleScreen.is_valid_name("name@domain")).is_false()

func test_invalid_name_empty() -> void:
	assert_bool(TitleScreen.is_valid_name("")).is_false()
