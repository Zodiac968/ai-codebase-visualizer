import "crypto";
import { isValidGithubUrl } from '../utils/validators.js';
import { analyzeRepository } from '../services/repoService.js';


const addRepository = async (req, res) => {
    const { repoUrl } = req.body;

    // Validate the repoUrl
    if (!isValidGithubUrl(repoUrl)) {
        return res.status(400).json({ success: false,  error: "Invalid repository URL" });
    }

    try {
        // Call the service to clone the repo locally
        const result = await analyzeRepository(repoUrl);

        return res.status(200).json({
        success: true,
        message: "Repository successfully downloaded for analysis.",
        data: {
            repositoryId: result.repositoryId,
            url: result.url,
        }});
    } catch (error) {
        console.error("Git clone failed:", error);
        return res.status(500).json({
        success: false,
        error: "Failed to clone repository. Make sure the repository is public and accessible.",
        });
    }
}

export { addRepository };