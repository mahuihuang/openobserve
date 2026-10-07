export const parsePromQlQuery = (query: string) => {
  const meta = {
    metricName: "" as string | null,
    label: {
      hasLabels: false,
      position: {
        start: 0,
        end: 0,
      },
      labels: {},
    },
  };
  // Extract metric name
  const metricNameMatch = query.match(/(\w+)\{/);
  const metricName = metricNameMatch ? metricNameMatch[1] : null;
  //Check if curly brace is present
  const curlyBracesRegex = /{([^{}]*?)}/;
  const curlyBracesRegexMatch = query.match(curlyBracesRegex);
  if (curlyBracesRegexMatch) {
    meta.label.hasLabels = true;
    // Get start and end position from regex return object
    meta.label.position.start = curlyBracesRegexMatch.index || 0;
    meta.label.position.end =
      (curlyBracesRegexMatch.index || 0) + curlyBracesRegexMatch[1].length + 1;
  }
  // Extract labels
  const labelsMatch = query.match(/\{(.+?)\}/);
  const labels: { [key: string]: string } = {};
  if (labelsMatch) {
    const labelsStr = labelsMatch[1];
    const labelPairs = labelsStr.match(/(\w+)="([^"]*)"/g);
    if (labelPairs?.length)
      labelPairs.forEach((pair) => {
        const matchResult = pair.match(/(\w+)="([^"]*)"/);
        const [key, value] = matchResult ? matchResult.slice(1) : [null, null];
        if (key && value) labels[key] = value;
      });
  }
  meta["label"]["labels"] = labels;
  meta["metricName"] = metricName;
  return meta;
};

/**
 * Escape a value so it survives being embedded in a PromQL double-quoted
 * string literal. Backslashes go first, or the ones this function introduces
 * would be escaped a second time.
 */
export const escapePromqlStringLiteral = (value: any): string =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");

/**
 * Escape a *literal* label value that is about to become the pattern of a
 * `=~` / `!~` matcher.
 *
 * Prometheus anchors regex matchers (`^(?:...)$`), so metacharacters in the
 * value change what it means: an APISIX `matched_uri` of `/api*` becomes
 * `^/api*$`, i.e. "/ap followed by zero or more i" — which never matches the
 * literal `/api*` the label actually holds. Grafana's Prometheus datasource
 * solves this with `prometheusSpecialRegexEscape`; this is the equivalent.
 *
 * The result is double-escaped on purpose: the regex needs `\*`, and the
 * PromQL string literal needs that backslash doubled, so the emitted query
 * text reads `=~"/api\\*"`.
 *
 * Only call this where the value is known to be a concrete label value — never
 * on a hand-written query, where metacharacters are intentional.
 */
export const escapePromqlRegexValue = (value: any): string =>
  escapePromqlStringLiteral(String(value ?? "").replace(/[\\^$*+?.()|[\]{}]/g, "\\$&"));

export const isPromqlRegexOperator = (operator: any): boolean =>
  operator === "=~" || operator === "!~";

export const addLabelToPromQlQuery = (
  originalQuery: any,
  label: any,
  value: any,
  operator: any,
) => {
  // With `=~` / `!~` the ad-hoc filter UI lets the user type a pattern, so the
  // value is passed through verbatim — escaping it would make the operator
  // useless. With `=` / `!=` the value is a literal, so quote it: an unescaped
  // `"` would otherwise close the string and produce an unparseable query.
  const escapedValue = isPromqlRegexOperator(operator)
    ? value
    : escapePromqlStringLiteral(value);

  const conditionToAdd = value ? `${label}${operator}"${escapedValue}"` : `${label}`;

  try {
    const parsedQuery = parsePromQlQuery(originalQuery);

    let query = "";
    if (!parsedQuery.label.hasLabels) {
      query = originalQuery + `{${conditionToAdd}}`;
    } else {
      query =
        originalQuery.slice(0, parsedQuery.label.position.end) +
        (originalQuery[parsedQuery.label.position.end - 1] !== "," &&
        parsedQuery.label.position.end - parsedQuery.label.position.start > 1
          ? ","
          : "") +
        conditionToAdd +
        originalQuery.slice(parsedQuery.label.position.end, originalQuery.length);
    }
    return query;
  } catch (e) {
    return originalQuery;
  }
};
