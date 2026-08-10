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

import { quoteSqlIdentifierIfNeeded } from "@/utils/query/sqlIdentifiers";

/**
 * Builds a `field <op> value` filter expression, choosing the operator and
 * quoting from the field's schema type across the selected streams:
 *
 *   int64 / float64 → unquoted value          (`code = 404`)
 *   boolean         → `is` / `is not`         (`ok is true`)
 *   null / empty    → `is` / `is not null`    (`msg is null`)
 *   everything else → quoted string           (`msg = 'boom'`)
 *
 * Identifiers are quoted only in SQL mode, matching the editor's dialect.
 *
 * Lives here rather than inside `useLogs` so that per-row components (the log
 * detail table and the expanded-row JSON preview, both mounted once per visible
 * hit) can build an expression without instantiating the whole `useLogs`
 * composable graph. `useLogs.getFilterExpressionByFieldType` delegates here, so
 * there is a single implementation.
 */
export function getFilterExpressionByFieldType(
  searchObj: any,
  field: string | number,
  field_value: string | number | boolean,
  action: string,
): string {
  let operator = action == "include" ? "=" : "!=";
  try {
    let fieldType: string = "utf8";

    const getStreamFieldTypes = (stream: any) => {
      if (!stream.schema) return {};
      return Object.fromEntries(stream.schema.map((schema: any) => [schema.name, schema.type]));
    };

    const fieldTypeList = searchObj.data.streamResults.list
      .filter((stream: any) => searchObj.data.stream.selectedStream.includes(stream.name))
      .reduce(
        (acc: any, stream: any) => ({
          ...acc,
          ...getStreamFieldTypes(stream),
        }),
        {},
      );

    if (Object.hasOwn(fieldTypeList, field)) {
      fieldType = fieldTypeList[field];
    }

    if (field_value === "null" || field_value === "" || field_value === null) {
      operator = action == "include" ? "is" : "is not";
      field_value = "null";
    }
    const quotedField =
      searchObj.meta.sqlMode === true ? quoteSqlIdentifierIfNeeded(String(field)) : field;
    let expression =
      field_value == "null"
        ? `${quotedField} ${operator} ${field_value}`
        : `${quotedField} ${operator} '${field_value}'`;

    const isNumericType = (type: string) => ["int64", "float64"].includes(type.toLowerCase());
    const isBooleanType = (type: string) => type.toLowerCase() === "boolean";

    if (isNumericType(fieldType)) {
      expression = `${quotedField} ${operator} ${field_value}`;
    } else if (isBooleanType(fieldType)) {
      operator = action == "include" ? "is" : "is not";
      expression = `${quotedField} ${operator} ${field_value}`;
    }

    return expression;
  } catch (e: any) {
    console.log("Error while getting filter expression by field type", e);
    const quotedField =
      searchObj.meta.sqlMode === true ? quoteSqlIdentifierIfNeeded(String(field)) : field;
    return `${quotedField} ${operator} '${field_value}'`;
  }
}
