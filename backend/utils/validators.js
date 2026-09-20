import { normalizeGithubUrl } from './urlNormalizer.js';

const isValidGithubUrl = (url) => {
  return normalizeGithubUrl(url) !== null;
};

export { isValidGithubUrl };