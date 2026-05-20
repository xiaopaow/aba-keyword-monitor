import { describe, expect, it } from "vitest";
import { detectAlerts, detectOpportunity, getChangeType, getChangeValue, normalizeRank, scoreOpportunity } from "./analytics.js";

describe("ranking analytics", () => {
  it("classifies ranking changes", () => {
    expect(getChangeType(300, 500)).toBe("up");
    expect(getChangeValue(300, 500)).toBe(200);
    expect(getChangeType(800, 300)).toBe("down");
    expect(getChangeValue(800, 300)).toBe(-500);
    expect(getChangeType(100, null)).toBe("new");
    expect(getChangeType(null, 100)).toBe("lost");
    expect(getChangeType(100, 100)).toBe("flat");
  });

  it("scores opportunity rules", () => {
    expect(
      scoreOpportunity({
        currentRank: 500,
        sevenDayChange: 1500,
        thirtyDayChange: 6000,
        appearedSevenDays: true,
        roseSevenDays: true
      })
    ).toBe(100);
  });

  it("detects opportunity types", () => {
    const rows = detectOpportunity({
      keyword: "wireless earbuds",
      currentRank: 256,
      firstSeenDate: "2026-05-20",
      currentDate: "2026-05-20",
      sevenDayRank: 6000,
      thirtyDayRank: 10000,
      recentRanks: [6000, 5000, 4000, 3000, 2000, 1000, 256]
    });

    expect(rows.map((row) => row.type)).toEqual(expect.arrayContaining(["new_opportunity", "burst", "rising", "high_potential"]));
  });

  it("detects alert types", () => {
    const rows = detectAlerts({
      keyword: "bluetooth speaker",
      currentRank: 1789,
      compareRank: 567,
      recentRanks: [500, 800, 1789],
      alertDate: "2026-05-20",
      isFavorite: true
    });

    expect(rows.map((row) => row.type)).toEqual(expect.arrayContaining(["drop_top1000", "continuous_down", "favorite_down"]));
  });

  it("validates ranks", () => {
    expect(normalizeRank("123")).toBe(123);
    expect(normalizeRank("0")).toBeNull();
    expect(normalizeRank("abc")).toBeNull();
  });
});
