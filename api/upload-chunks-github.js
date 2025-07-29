import { readFileSync, readdirSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // GitHub configuration (these should be environment variables in production)
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'your-github-token';
        const GITHUB_REPO = process.env.GITHUB_REPO || 'your-username/your-repo';
        const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

        if (!GITHUB_TOKEN || GITHUB_TOKEN === 'your-github-token') {
            return res.status(400).json({ 
                error: 'GitHub token not configured. Please set GITHUB_TOKEN environment variable.' 
            });
        }

        // Paths to semantic output
        const outputDir = path.join(__dirname, '..', 'semantic_output');
        const chunksFile = path.join(outputDir, 'semantic_chunks.json');
        const imagesDir = path.join(outputDir, 'images');

        if (!existsSync(chunksFile)) {
            return res.status(404).json({ 
                error: 'Semantic chunks not found. Please process chunks first.' 
            });
        }

        // Read chunks JSON
        const chunksData = readFileSync(chunksFile, 'utf8');
        const chunks = JSON.parse(chunksData);

        // Get list of image files
        let imageFiles = [];
        if (existsSync(imagesDir)) {
            imageFiles = readdirSync(imagesDir).filter(file => 
                /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(file)
            );
        }

        console.log(`Uploading ${chunks.length} chunks and ${imageFiles.length} images to GitHub...`);

        // Upload chunks JSON
        await uploadFileToGitHub(
            GITHUB_TOKEN,
            GITHUB_REPO,
            GITHUB_BRANCH,
            'semantic_output/semantic_chunks.json',
            chunksData,
            'Update semantic chunks data'
        );

        // Upload images
        let uploadedImages = 0;
        for (const imageFile of imageFiles) {
            const imagePath = path.join(imagesDir, imageFile);
            const imageData = readFileSync(imagePath);
            const base64Data = imageData.toString('base64');

            await uploadFileToGitHub(
                GITHUB_TOKEN,
                GITHUB_REPO,
                GITHUB_BRANCH,
                `semantic_output/images/${imageFile}`,
                base64Data,
                `Update image: ${imageFile}`,
                true // is binary
            );

            uploadedImages++;
        }

        // Upload README with processing information
        const readmeContent = generateReadmeContent(chunks, imageFiles);
        await uploadFileToGitHub(
            GITHUB_TOKEN,
            GITHUB_REPO,
            GITHUB_BRANCH,
            'semantic_output/README.md',
            readmeContent,
            'Update semantic chunking README'
        );

        res.status(200).json({
            success: true,
            message: 'Successfully uploaded to GitHub',
            details: {
                chunksUploaded: chunks.length,
                imagesUploaded: uploadedImages,
                readmeUpdated: true,
                repository: GITHUB_REPO,
                branch: GITHUB_BRANCH
            }
        });

    } catch (error) {
        console.error('GitHub upload error:', error);
        res.status(500).json({ 
            error: 'Failed to upload to GitHub', 
            details: error.message 
        });
    }
}

/**
 * Upload a file to GitHub repository
 */
async function uploadFileToGitHub(token, repo, branch, path, content, message, isBinary = false) {
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    
    // Get current file SHA if it exists (for updates)
    let sha = null;
    try {
        const getResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (getResponse.ok) {
            const existingFile = await getResponse.json();
            sha = existingFile.sha;
        }
    } catch (error) {
        // File doesn't exist, that's fine
    }

    // Upload or update file
    const uploadData = {
        message,
        content: isBinary ? content : Buffer.from(content).toString('base64'),
        branch
    };

    if (sha) {
        uploadData.sha = sha;
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(uploadData)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return await response.json();
}

/**
 * Generate README content explaining the chunking process
 */
function generateReadmeContent(chunks, imageFiles) {
    const totalChunks = chunks.length;
    const totalImages = imageFiles.length;
    const avgChunkSize = Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / totalChunks);
    
    // Analyze chunks for statistics
    const statesFound = new Set();
    const sectionsFound = new Set();
    const topicsFound = new Set();
    let chunksWithImages = 0;

    chunks.forEach(chunk => {
        if (chunk.metadata) {
            if (chunk.metadata.states) chunk.metadata.states.forEach(s => statesFound.add(s));
            if (chunk.metadata.sections) chunk.metadata.sections.forEach(s => sectionsFound.add(s));
            if (chunk.metadata.topics) chunk.metadata.topics.forEach(s => topicsFound.add(s));
            if (chunk.metadata.has_images) chunksWithImages++;
        }
    });

    return `# GTI SOP Semantic Chunks

## Processing Summary

**Generated on:** ${new Date().toISOString()}

### Statistics
- **Total Chunks:** ${totalChunks}
- **Total Images:** ${totalImages}
- **Chunks with Images:** ${chunksWithImages}
- **Average Chunk Size:** ${avgChunkSize} characters

### Content Coverage
- **States:** ${Array.from(statesFound).sort().join(', ') || 'None detected'}
- **Sections:** ${Array.from(sectionsFound).sort().join(', ') || 'None detected'}
- **Topics:** ${Array.from(topicsFound).sort().join(', ') || 'None detected'}

## Chunking Logic

### 1. Image Placement in Text
- Images are marked within chunk text using \`[IMAGE_PLACEHOLDER_N]\` markers
- These markers indicate the exact position where images appear relative to text
- Images without labels are still included with position markers
- This allows AI systems to understand the visual context within the text flow

### 2. Chunk Size Management
- **Target Size:** Configurable (default: 800 characters)
- **Maximum Size:** Configurable (default: 1200 characters)
- **Overlap:** 150 characters between adjacent chunks for context preservation

### 3. Image Association Rules
- Images are included in chunks only if they appear:
  - In the middle of the chunk text, OR
  - After the chunk text
- Multiple consecutive images without labels are grouped with the preceding text
- Images appearing before chunk text are excluded to avoid context confusion

### 4. Tab Separation Handling
- Original Google Doc tabs are preserved as separate sections where possible
- Different tabs cannot be merged into the same chunk
- Section boundaries are detected through formatting and content patterns
- This ensures topic coherence and prevents cross-contamination of different subjects

### 5. Context Preservation
- Each chunk maintains metadata about:
  - **States:** Geographic locations (OH, MD, NJ, IL, NY, NV, MA)  
  - **Sections:** Order types (RISE, REGULAR, GENERAL)
  - **Topics:** Subject categories (PRICING, BATTERIES, BATCH_SUB, etc.)
- Context is carried forward through overlapping text
- State and section changes trigger chunk boundaries when appropriate

## File Structure

\`\`\`
semantic_output/
├── semantic_chunks.json    # Main chunks data with metadata
├── images/                # Extracted images from document
│   ├── image_1.png
│   ├── image_2.png
│   └── ...
└── README.md             # This documentation
\`\`\`

## JSON Schema

Each chunk in \`semantic_chunks.json\` follows this structure:

\`\`\`json
{
  "chunk_id": 0,
  "text": "Text content with [IMAGE_PLACEHOLDER_1] markers...",
  "images": [
    {
      "filename": "image_1.png",
      "path": "semantic_output/images/image_1.png", 
      "label": "Image 1: Description",
      "number": 1,
      "context_text": "Surrounding text context",
      "state": "OH",
      "section": "RISE",
      "topic": "PRICING"
    }
  ],
  "metadata": {
    "states": ["OH"],
    "sections": ["RISE"], 
    "topics": ["PRICING"],
    "element_count": 4,
    "has_images": true,
    "image_count": 1,
    "char_count": 285,
    "word_count": 47,
    "tab_section": "Ohio Operations"
  }
}
\`\`\`

## Usage Notes

- This data is optimized for AI systems that need to understand both textual and visual content
- Image placeholders maintain the original document flow and context
- Metadata enables efficient filtering and retrieval by state, section, or topic
- The chunking preserves semantic coherence while meeting size constraints for language models

---

*Generated by GTI SOP Assistant - Semantic Chunking System*
`;
}