const isValidGithubUrl = (url) => {
  if (!url) return false;
  
  // Simple Regex for GitHub repository URLs
  const githubRegex = /^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/;
  return githubRegex.test(url);
};

export { isValidGithubUrl };