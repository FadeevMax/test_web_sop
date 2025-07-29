// Vercel serverless function to save files to GitHub
// Alternative to Google Drive with no service account limitations

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    
    try {
        const { documentId, documentInfo } = req.body;
        
        if (!documentId || !documentInfo) {
            return res.status(400).json({ error: 'Document ID and document info are required' });
        }
        
        console.log(`💾 Starting GitHub save for: ${documentInfo.name}`);
        
        // Import googleapis dynamically
        const { google } = await import('googleapis');
        const { GoogleAuth } = await import('google-auth-library');
        
        // Build service account credentials (for Google Docs export only)
        let serviceAccountKey;
        
        if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            serviceAccountKey = {
                type: 'service_account',
                project_id: process.env.GOOGLE_PROJECT_ID,
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                token_uri: 'https://oauth2.googleapis.com/token',
                auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL)}`,
                universe_domain: 'googleapis.com'
            };
            console.log('✅ Built service account from environment variables');
        } else {
            return res.status(500).json({ 
                error: 'Google service account credentials not configured'
            });
        }
        
        // Initialize Google Auth (only for document export)
        console.log('🔐 Initializing Google Auth for document export...');
        const auth = new GoogleAuth({
            credentials: serviceAccountKey,
            scopes: [
                'https://www.googleapis.com/auth/documents.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        });
        
        const authClient = await auth.getClient();
        const drive = google.drive({ version: 'v3', auth: authClient });
        
        // Export the document as DOCX
        console.log('📄 Exporting document from Google Docs...');
        const exportResponse = await drive.files.export({
            fileId: documentId,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        
        // Convert the export response to buffer
        let docxBuffer;
        if (exportResponse.data instanceof ArrayBuffer) {
            docxBuffer = Buffer.from(exportResponse.data);
        } else if (typeof exportResponse.data === 'string') {
            docxBuffer = Buffer.from(exportResponse.data, 'binary');
        } else {
            // Handle Blob or other types by converting to ArrayBuffer first
            const arrayBuffer = await exportResponse.data.arrayBuffer();
            docxBuffer = Buffer.from(arrayBuffer);
        }
        
        console.log(`📊 DOCX buffer size: ${docxBuffer.length} bytes`);
        
        // Convert to base64 for GitHub API
        const docxBase64 = docxBuffer.toString('base64');
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `${documentInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.docx`;
        const filePath = `documents/${fileName}`;
        
        // GitHub API configuration
        const githubToken = process.env.GITHUB_TOKEN;
        const githubRepo = process.env.GITHUB_REPO || 'FadeevMax/test_web_sop'; // Your repo
        const githubBranch = process.env.GITHUB_BRANCH || 'main';
        
        if (!githubToken) {
            return res.status(500).json({
                error: 'GitHub token not configured',
                details: 'Please set GITHUB_TOKEN environment variable'
            });
        }
        
        console.log(`📁 Saving to GitHub: ${githubRepo}/${filePath}`);
        
        // Check if file already exists
        let sha = null;
        try {
            const existingFileResponse = await fetch(
                `https://api.github.com/repos/${githubRepo}/contents/${filePath}`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            if (existingFileResponse.ok) {
                const existingFile = await existingFileResponse.json();
                sha = existingFile.sha;
                console.log('📝 File exists, will update it');
            }
        } catch (error) {
            console.log('📄 File does not exist, will create new one');
        }
        
        // Upload/Update file to GitHub
        const commitMessage = `Update ${documentInfo.name} - ${timestamp}`;
        const githubResponse = await fetch(
            `https://api.github.com/repos/${githubRepo}/contents/${filePath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: commitMessage,
                    content: docxBase64,
                    branch: githubBranch,
                    ...(sha && { sha }) // Include SHA if updating existing file
                })
            }
        );
        
        if (!githubResponse.ok) {
            const errorData = await githubResponse.json().catch(() => ({}));
            throw new Error(`GitHub API error: ${githubResponse.status} - ${errorData.message || 'Unknown error'}`);
        }
        
        const githubData = await githubResponse.json();
        
        console.log(`✅ Successfully saved to GitHub: ${githubData.content.name}`);
        
        const response = {
            success: true,
            githubFile: {
                name: fileName,
                path: filePath,
                url: githubData.content.html_url,
                downloadUrl: githubData.content.download_url,
                sha: githubData.content.sha,
                repository: githubRepo,
                branch: githubBranch,
                action: sha ? 'updated' : 'created'
            },
            timestamp: new Date().toISOString()
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('❌ GitHub save error:', error);
        
        let errorMessage = 'Failed to save to GitHub';
        let statusCode = 500;
        
        if (error.message.includes('GitHub API error')) {
            errorMessage = 'GitHub API error';
            statusCode = 500;
        } else if (error.message.includes('File not found')) {
            errorMessage = 'Document not found';
            statusCode = 404;
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
}