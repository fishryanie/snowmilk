/** Accept a copied dotenv assignment or the raw bootstrap secret. */
export function normalizeBootstrapToken(value: string) {
  let token = value.trim();
  const assignment = /^(?:export\s+)?AUTH_BOOTSTRAP_TOKEN\s*=\s*(.*)$/.exec(token);
  if (assignment) token = assignment[1].trim();
  if (
    token.length >= 2 &&
    ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}
