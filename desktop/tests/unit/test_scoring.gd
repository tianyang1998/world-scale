extends GdUnitTestSuite

# percentile_score: value below min returns 0.0
func test_percentile_score_below_min_returns_zero() -> void:
    var dist := {"min": 10.0, "max": 100.0}
    assert_float(Scorer.percentile_score(5.0, dist)).is_equal_approx(0.0, 0.001)

# percentile_score: value above max returns 100.0
func test_percentile_score_above_max_returns_hundred() -> void:
    var dist := {"min": 10.0, "max": 100.0}
    assert_float(Scorer.percentile_score(150.0, dist)).is_equal_approx(100.0, 0.001)

# percentile_score: midpoint value returns 50.0
func test_percentile_score_midpoint_returns_fifty() -> void:
    var dist := {"min": 0.0, "max": 100.0}
    assert_float(Scorer.percentile_score(50.0, dist)).is_equal_approx(50.0, 0.001)

# log_years: 0 years returns 0.0 (log10(0+1) = log10(1) = 0.0)
func test_log_years_zero_returns_zero() -> void:
    assert_float(Scorer.log_years(0.0)).is_equal_approx(0.0, 0.001)

# log_years: 9 years returns 1.0 (log10(9+1) = log10(10) = 1.0)
func test_log_years_nine_returns_one() -> void:
    assert_float(Scorer.log_years(9.0)).is_equal_approx(1.0, 0.001)

# compute_power: all stats at 1.0 → 2000+1500+1500+2500+2500 = 10000
func test_compute_power_all_ones_returns_10000() -> void:
    assert_int(Scorer.compute_power(1.0, 1.0, 1.0, 1.0, 1.0)).is_equal(10000)

# get_tier: power 0 → "Apprentice"
func test_get_tier_power_0_returns_apprentice() -> void:
    assert_str(Scorer.get_tier(0)).is_equal("Apprentice")

# get_tier: power 11200 → "Legend"
func test_get_tier_power_11200_returns_legend() -> void:
    assert_str(Scorer.get_tier(11200)).is_equal("Legend")

# get_tier: power 4000 → "Scholar"
func test_get_tier_power_4000_returns_scholar() -> void:
    assert_str(Scorer.get_tier(4000)).is_equal("Scholar")
