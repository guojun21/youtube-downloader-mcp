/**
 * Why: MCP protocol requires responses in a specific content array format;
 * these helpers standardize success and error response shapes.
 */

export function formatSuccessResultAsJsonContent(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function formatErrorResultAsTextContent(errorMessage) {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}
