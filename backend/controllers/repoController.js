import { isValidGithubUrl } from '../utils/validators.js';
import { analyzeRepository, getRepositoryGraph } from '../services/repoService.js';

const addRepository = async (req, res) => {
    const { repoUrl } = req.body;

    // Validate the repoUrl
    if (!isValidGithubUrl(repoUrl)) {
        return res.status(400).json({ success: false, error: "Invalid repository URL" });
    }

    try {
        // Call the service to clone and analyze the repo
        const result = await analyzeRepository(repoUrl);

        return res.status(200).json({
            success: true,
            message: "Repository successfully downloaded and analyzed.",
            data: {
                repositoryId: result.repositoryId,
                url: result.url,
                graph: result.graph,
                validation: result.validation,
            }
        });
    } catch (error) {
        console.error("Repository analysis failed:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to analyze repository.",
        });
    }
};

const getGraph = async (req, res) => {
    const { id } = req.params;

    try {
        const graph = getRepositoryGraph(id);
        if (!graph) {
            return res.status(404).json({
                success: false,
                error: `Graph not found for repository ID: ${id}`,
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                repositoryId: id,
                graph,
            },
        });
    } catch (error) {
        console.error("Failed to retrieve graph:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to retrieve graph.",
        });
    }
};

export { addRepository, getGraph };