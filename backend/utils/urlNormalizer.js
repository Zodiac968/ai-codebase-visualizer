/**
 * Normalizes a GitHub repository URL into a deterministic identifier and canonical components.
 * 
 * Examples:
 *   "https://github.com/Octocat/Hello-World.git/" ->
 *   {
 *     id: "octocat__hello-world",
 *     fullName: "octocat/hello-world",
 *     owner: "octocat",
 *     name: "hello-world",
 *     canonicalUrl: "https://github.com/octocat/hello-world"
 *   }
 * 
 * @param {string} rawUrl - The input repository URL
 * @returns {{ id: string, fullName: string, owner: string, name: string, canonicalUrl: string } | null}
 */
export function normalizeGithubUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let cleaned = rawUrl.trim();

  // Strip protocol if present
  cleaned = cleaned.replace(/^https?:\/\//i, '');

  // Strip www. if present
  cleaned = cleaned.replace(/^www\./i, '');

  // Check if starts with github.com/
  if (!/^github\.com\//i.test(cleaned)) {
    return null;
  }

  // Remove github.com/ prefix
  cleaned = cleaned.replace(/^github\.com\//i, '');

  // Strip trailing .git and trailing slashes
  cleaned = cleaned.replace(/\.git\/?$/i, '').replace(/\/+$/, '');

  // Split into parts
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const owner = parts[0].toLowerCase();
  const name = parts[1].toLowerCase();

  // Basic validation of GitHub usernames and repo names
  const validSegmentRegex = /^[a-z0-9_.-]+$/;
  if (!validSegmentRegex.test(owner) || !validSegmentRegex.test(name)) {
    return null;
  }

  const fullName = `${owner}/${name}`;
  const id = `${owner}__${name}`;
  const canonicalUrl = `https://github.com/${owner}/${name}`;

  return {
    id,
    fullName,
    owner,
    name,
    canonicalUrl,
  };
}
