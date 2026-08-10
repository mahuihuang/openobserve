// Copyright 2026 OpenObserve Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { describe, it, expect, vi } from "vitest";
import { buildClickWordFilter } from "./buildClickWordFilter";

// Stand-in for useLogs' field-type-aware builder; the real one is covered by
// its own suite. Here we only care that it is consulted for full-value matches.
const getFilterExpr = vi.fn(
  (field: string | number, value: string | number | boolean, action: string) =>
    `${field} ${action === "include" ? "=" : "!="} '${value}'`,
);

describe("buildClickWordFilter", () => {
  describe("FTS fields", () => {
    it("uses match_all for include", () => {
      expect(
        buildClickWordFilter("msg", "boom", "payment boom retry", "include", { ftsKey: true }),
      ).toBe("match_all('boom')");
    });

    it("uses NOT match_all for exclude", () => {
      expect(
        buildClickWordFilter("msg", "boom", "payment boom retry", "exclude", { ftsKey: true }),
      ).toBe("NOT match_all('boom')");
    });

    it("takes precedence over a full-value match", () => {
      expect(
        buildClickWordFilter("msg", "boom", "boom", "include", { ftsKey: true }, getFilterExpr),
      ).toBe("match_all('boom')");
    });
  });

  describe("non-FTS fields, full value clicked", () => {
    it("delegates to the field-type-aware builder", () => {
      getFilterExpr.mockClear();

      const result = buildClickWordFilter(
        "level",
        "error",
        "error",
        "include",
        { ftsKey: false },
        getFilterExpr,
      );

      expect(getFilterExpr).toHaveBeenCalledWith("level", "error", "include");
      expect(result).toBe("level = 'error'");
    });

    it("ignores surrounding whitespace when comparing to the full value", () => {
      getFilterExpr.mockClear();

      buildClickWordFilter(
        "level",
        "error",
        "  error  ",
        "exclude",
        { ftsKey: false },
        getFilterExpr,
      );

      expect(getFilterExpr).toHaveBeenCalledWith("level", "error", "exclude");
    });

    it("falls back to str_match when no builder is supplied", () => {
      expect(buildClickWordFilter("level", "error", "error", "include", { ftsKey: false })).toBe(
        "str_match(level, 'error')",
      );
    });
  });

  describe("non-FTS fields, partial value clicked", () => {
    it("uses str_match for include", () => {
      expect(
        buildClickWordFilter(
          "msg",
          "boom",
          "payment boom retry",
          "include",
          { ftsKey: false },
          getFilterExpr,
        ),
      ).toBe("str_match(msg, 'boom')");
    });

    it("uses NOT str_match for exclude", () => {
      expect(
        buildClickWordFilter(
          "msg",
          "boom",
          "payment boom retry",
          "exclude",
          { ftsKey: false },
          getFilterExpr,
        ),
      ).toBe("NOT str_match(msg, 'boom')");
    });
  });

  describe("quote escaping", () => {
    it("doubles single quotes in match_all", () => {
      expect(buildClickWordFilter("msg", "it's", "it's here", "include", { ftsKey: true })).toBe(
        "match_all('it''s')",
      );
    });

    it("doubles single quotes in str_match", () => {
      expect(buildClickWordFilter("msg", "it's", "it's here", "exclude", { ftsKey: false })).toBe(
        "NOT str_match(msg, 'it''s')",
      );
    });
  });

  it("treats missing field metadata as non-FTS", () => {
    expect(buildClickWordFilter("msg", "boom", "payment boom", "include", undefined)).toBe(
      "str_match(msg, 'boom')",
    );
  });
});
