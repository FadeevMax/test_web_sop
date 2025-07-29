import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { EnhancedDocxProcessor } from './docx-processor.js';

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
        const { chunkSize = 800, maxChunkSize = 1200, overlapSize = 150 } = req.body;
        
        // GitHub configuration (reuse existing credentials)
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_REPO = process.env.GITHUB_REPO;
        const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

        if (!GITHUB_TOKEN || !GITHUB_REPO) {
            return res.status(400).json({ 
                error: 'GitHub credentials not configured. Please set GITHUB_TOKEN and GITHUB_REPO environment variables.' 
            });
        }

        // Download the DOCX file from GitHub
        const docxPath = await downloadDocxFromGitHub(GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH);
        
        if (!docxPath) {
            return res.status(404).json({ 
                error: 'DOCX file not found on GitHub. Please ensure GTI_Data_Base_and_SOP.docx exists in the repository.' 
            });
        }

        // Create output directory
        const outputDir = path.join(__dirname, '..', 'semantic_output');
        const imagesDir = path.join(outputDir, 'images');
        
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
        if (!existsSync(imagesDir)) {
            mkdirSync(imagesDir, { recursive: true });
        }

        // Process the document using our enhanced chunking logic
        const processor = new EnhancedDocxProcessor({
            targetChunkSize: parseInt(chunkSize),
            maxChunkSize: parseInt(maxChunkSize),
            overlapSize: parseInt(overlapSize)
        });

        const { chunks, imageCount, statistics } = await processor.processDocument(docxPath, outputDir);

        // Save chunks to JSON file
        const chunksPath = path.join(outputDir, 'semantic_chunks.json');
        writeFileSync(chunksPath, JSON.stringify(chunks, null, 2));

        // Upload processed results back to GitHub
        await uploadResultsToGitHub(GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, chunks, outputDir);

        res.status(200).json({
            success: true,
            message: 'Document processed and uploaded to GitHub successfully',
            statistics: {
                totalChunks: chunks.length,
                totalImages: imageCount,
                averageChunkSize: Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length),
                ...statistics
            },
            outputPath: outputDir,
            chunksFile: 'semantic_chunks.json',
            imagesFolder: 'images',
            githubRepo: GITHUB_REPO
        });

    } catch (error) {
        console.error('Semantic chunking error:', error);
        res.status(500).json({ 
            error: 'Failed to process document', 
            details: error.message 
        });
    }
}

/**
 * Download DOCX file from GitHub repository
 */
async function downloadDocxFromGitHub(token, repo, branch) {
    try {
        const fileName = 'GTI_Data_Base_and_SOP.docx';
        const url = `https://api.github.com/repos/${repo}/contents/${fileName}?ref=${branch}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            console.error(`GitHub API error: ${response.status}`);
            return null;
        }

        const fileData = await response.json();
        
        // Decode base64 content
        const buffer = Buffer.from(fileData.content, 'base64');
        
        // Save to local cache
        const cacheDir = path.join(__dirname, '..', 'cache');
        if (!existsSync(cacheDir)) {
            mkdirSync(cacheDir, { recursive: true });
        }
        
        const localPath = path.join(cacheDir, fileName);
        writeFileSync(localPath, buffer);
        
        console.log(`Downloaded DOCX file from GitHub: ${fileName}`);
        return localPath;
        
    } catch (error) {
        console.error('Error downloading DOCX from GitHub:', error);
        return null;
    }
}

/**
 * Upload processed results to GitHub
 */
async function uploadResultsToGitHub(token, repo, branch, chunks, outputDir) {
    try {
        console.log('Uploading processed results to GitHub...');
        
        // Upload chunks JSON
        const chunksData = JSON.stringify(chunks, null, 2);
        await uploadFileToGitHub(
            token, repo, branch,
            'semantic_chunks.json',
            chunksData,
            'Update semantic chunks data'
        );

        // Upload images
        const imagesDir = path.join(outputDir, 'images');
        if (existsSync(imagesDir)) {
            const imageFiles = readdirSync(imagesDir).filter(file => 
                /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(file)
            );

            for (const imageFile of imageFiles) {
                const imagePath = path.join(imagesDir, imageFile);
                const imageData = readFileSync(imagePath);
                const base64Data = imageData.toString('base64');

                await uploadFileToGitHub(
                    token, repo, branch,
                    `images/${imageFile}`,
                    base64Data,
                    `Update image: ${imageFile}`,
                    true // is binary
                );
            }
            
            console.log(`Uploaded ${imageFiles.length} images to GitHub`);
        }

        // Upload README with processing information
        const readmeContent = generateReadmeContent(chunks);
        await uploadFileToGitHub(
            token, repo, branch,
            'semantic_README.md',
            readmeContent,
            'Update semantic chunking documentation'
        );

        console.log('All files uploaded to GitHub successfully');
        
    } catch (error) {
        console.error('Error uploading to GitHub:', error);
        throw error;
    }
}

/**
 * Upload a file to GitHub repository (overwrites existing)
 */
async function uploadFileToGitHub(token, repo, branch, filePath, content, message, isBinary = false) {
    const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    
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
        uploadData.sha = sha; // This ensures we overwrite the existing file
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
function generateReadmeContent(chunks) {
    const totalChunks = chunks.length;
    const totalImages = chunks.reduce((sum, chunk) => sum + (chunk.images?.length || 0), 0);
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

    return `# GTI SOP Semantic Processing Results

## Processing Summary

**Generated on:** ${new Date().toISOString()}  
**Source File:** GTI_Data_Base_and_SOP.docx

### Statistics
- **Total Chunks:** ${totalChunks}
- **Total Images:** ${totalImages}
- **Chunks with Images:** ${chunksWithImages}
- **Average Chunk Size:** ${avgChunkSize} characters

### Content Coverage
- **States:** ${Array.from(statesFound).sort().join(', ') || 'None detected'}
- **Sections:** ${Array.from(sectionsFound).sort().join(', ') || 'None detected'}
- **Topics:** ${Array.from(topicsFound).sort().join(', ') || 'None detected'}

## File Structure

\`\`\`
Repository Root/
├── GTI_Data_Base_and_SOP.docx    # Source document
├── semantic_chunks.json          # Processed chunks with image placeholders
├── images/                       # Extracted images from document
│   ├── image_1.png
│   ├── image_2.png
│   └── ...
└── semantic_README.md           # This documentation
\`\`\`

## Key Features

### Image Placeholder Integration
Images are embedded directly in chunk text using markers like \`[IMAGE_PLACEHOLDER_1]\`. This preserves the visual context within the text flow for AI processing.

### Smart Image Positioning
- ✅ **Included**: Images appearing in middle or after chunk text
- ❌ **Excluded**: Images appearing before chunk text
- 🔗 **Grouped**: Multiple consecutive unlabeled images with preceding text

### Context Preservation
Each chunk maintains metadata about:
- **Geographic States**: OH, MD, NJ, IL, NY, NV, MA
- **Order Types**: RISE (internal), REGULAR (wholesale), GENERAL
- **Topics**: PRICING, BATTERIES, BATCH_SUB, DELIVERY_DATE, etc.

## Usage

This processed data is optimized for AI systems that need to understand both textual and visual content from the GTI Standard Operating Procedures.

The \`semantic_chunks.json\` file contains structured data with:
- Text content with embedded image placeholders
- Associated image metadata and file references
- Rich contextual metadata for filtering and search

---

*Auto-generated by GTI SOP Assistant - Semantic Chunking System*
`;
}

