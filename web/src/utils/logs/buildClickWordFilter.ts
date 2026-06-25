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

/**
 * Builds a filter expression for a clicked word based on the field's metadata.
 *
 * Strategy:
 *  - FTS field → match_all('word') / NOT match_all('word')
 *  - Non-FTS + word equals full field value → use getFilterExpressionByFieldType
 *    (handles numeric, boolean, null, string correctly)
 *  - Non-FTS + word is partial (substring of field value) → str_match / NOT str_match
 *
 * @param fieldName   The field name
 * @param word        The clicked word
 * @param fullValue   The complete field value (to detect partial vs full match)
 * @param action      "include" or "exclude"
 * @param fieldMeta   Field metadata from selectedStreamFields
 * @param getFilterExprFn  The existing getFilterExpressionByFieldType function
 */
export function buildClickWordFilter(
    fieldName: string,
    word: string,
    fullValue: string,
    action: "include" | "exclude",
    fieldMeta: { ftsKey?: boolean; dataType?: string } | undefined,
    getFilterExprFn?: (
        field: string | number,
        value: string | number | boolean,
        action: string,
    ) => string,
): string {
    const escaped = word.replace(/'/g, "''");
    const isFts = fieldMeta?.ftsKey ?? false;

    // FTS fields: use match_all for full-text search across all indexed fields
    if (isFts) {
        return action === "include"
            ? `match_all('${escaped}')`
            : `NOT match_all('${escaped}')`;
    }

    // Check if the clicked word is the entire field value
    const isFullValue = String(fullValue).trim() === String(word).trim();

    if (isFullValue && getFilterExprFn) {
        // Full value match: use the existing field-type-aware filter builder
        // which handles numeric (no quotes), boolean (is/is not), null, and string
        return getFilterExprFn(fieldName, word, action);
    }

    // Partial value (substring): use str_match for substring containment
    return action === "include"
        ? `str_match(${fieldName}, '${escaped}')`
        : `NOT str_match(${fieldName}, '${escaped}')`;
}
