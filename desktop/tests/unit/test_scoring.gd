extends GdUnitTestSuite

# Test percentile scoring formula
func test_percentile_score_at_p50_returns_50() -> void:
	var dist := {"p25": 4.0, "p50": 9.0, "p75": 18.0, "p90": 32.0, "p99": 60.0}
	var result := Scorer.percentile_score(9.0, dist)
	assert_float(result).is_equal_approx(50.0, 0.1)

func test_percentile_score_at_zero_returns_zero() -> void:
	var dist := {"p25": 4.0, "p50": 9.0, "p75": 18.0, "p90": 32.0, "p99": 60.0}
	var result := Scorer.percentile_score(0.0, dist)
	assert_float(result).is_equal_approx(0.0, 0.1)

func test_percentile_score_above_p99x3_returns_100() -> void:
	var dist := {"p25": 4.0, "p50": 9.0, "p75": 18.0, "p90": 32.0, "p99": 60.0}
	var result := Scorer.percentile_score(200.0, dist)  # well above p99×3=180
	assert_float(result).is_equal_approx(100.0, 0.1)

func test_log_years_at_zero_returns_zero() -> void:
	var result := Scorer.log_years(0.0)
	assert_float(result).is_equal_approx(0.0, 0.1)

func test_log_years_at_41_returns_near_100() -> void:
	# log(42)/log(42) = 1.0 → ×100 = 100
	var result := Scorer.log_years(41.0)
	assert_float(result).is_equal_approx(100.0, 0.1)

func test_power_formula_all_stats_at_50_gives_expected_range() -> void:
	# raw = 50×0.20 + 50×0.25 + 50×0.30 + 50×0.15 + 50×0.10 = 50
	# power = round(50 × 120) = 6000
	var result := Scorer.compute_power(50.0, 50.0, 50.0, 50.0, 50.0)
	assert_int(result).is_equal(6000)

func test_get_tier_power_0_returns_apprentice() -> void:
	assert_str(Scorer.get_tier(0)).is_equal("Apprentice")

func test_get_tier_power_11200_returns_legend() -> void:
	assert_str(Scorer.get_tier(11200)).is_equal("Legend")

func test_get_tier_power_4000_returns_scholar() -> void:
	assert_str(Scorer.get_tier(4000)).is_equal("Scholar")
