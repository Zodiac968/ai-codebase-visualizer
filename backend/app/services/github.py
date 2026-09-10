import re
from typing import Tuple, Optional


GITHUB_URL_REGEX = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+?)(?:\.git)?/?$"
)


def validate_and_parse_github_url(raw_url: str) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
    """
    Validates a public GitHub repository URL and extracts owner and repository name.
    
    Returns:
        (is_valid, normalized_url, owner, repo_name)
    """
    if not raw_url or not isinstance(raw_url, str):
        return False, None, None, None

    cleaned_url = raw_url.strip()
    match = GITHUB_URL_REGEX.match(cleaned_url)
    if not match:
        return False, None, None, None

    owner, repo = match.groups()
    
    # Strip any trailing .git from repo name if present
    if repo.endswith(".git"):
        repo = repo[:-4]

    if not owner or not repo:
        return False, None, None, None

    normalized_url = f"https://github.com/{owner}/{repo}"
    return True, normalized_url, owner, repo
