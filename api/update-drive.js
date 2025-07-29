// Vercel serverless function to update files on Google Drive
// Saves DOCX files to organized folders in Google Drive

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Increase body size limit for Vercel
    res.setHeader('Access-Control-Max-Age', '86400');
    
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
        
        console.log(`💾 Starting Google Drive update for: ${documentInfo.name}`);
        
        // Import googleapis dynamically
        const { google } = await import('googleapis');
        const { GoogleAuth } = await import('google-auth-library');
        
        // Build service account credentials (same as google-docs-sync.js)
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
        
        // Initialize Google Auth
        console.log('🔐 Initializing Google Auth...');
        const auth = new GoogleAuth({
            credentials: serviceAccountKey,
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/documents.readonly'
            ]
        });
        
        const authClient = await auth.getClient();
        const drive = google.drive({ version: 'v3', auth: authClient });
        
        // Re-export the document directly from Google Docs (matching Python approach)
        console.log('📄 Re-exporting document from Google Docs...');
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
        
        // Use specific folder ID from environment or default - match Python exactly
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1YhzMVcEiaBibSAUfycxDlKVcWQ3Yi-xR';
        console.log(`📁 Target folder ID: ${folderId}`);
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `${documentInfo.name}_${timestamp}.docx`;
        
        // Use Python's exact approach: files().create(body=file_metadata, media_body=media)
        console.log(`📄 Creating DOCX file using Python-matching approach...`);
        
        // Create a readable stream from the buffer (like Python's MediaIoBaseUpload equivalent)
        const { Readable } = await import('stream');
        const docxStream = new Readable({
            read() {
                this.push(docxBuffer);
                this.push(null);
            }
        });
        
        const uploadResponse = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [folderId],
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            },
            media: {
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                body: docxStream
            },
            fields: 'id, name, webViewLink, modifiedTime'
        });
        
        console.log(`✅ Successfully saved to Drive: ${uploadResponse.data.name} (${uploadResponse.data.id})`);
        
        const response = {
            success: true,
            driveFile: {
                id: uploadResponse.data.id,
                name: uploadResponse.data.name,
                webViewLink: uploadResponse.data.webViewLink,
                modifiedTime: uploadResponse.data.modifiedTime,
                folderId: folderId,
                folderName: 'Drive Folder (or My Drive if move failed)',
                action: 'created'
            },
            timestamp: new Date().toISOString()
        };
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('❌ Drive update error:', error);
        
        let errorMessage = 'Failed to update Google Drive';
        let statusCode = 500;
        
        if (error.code === 403) {
            errorMessage = 'Access denied to Google Drive';
            statusCode = 403;
        } else if (error.code === 404) {
            errorMessage = 'Google Drive not accessible';
            statusCode = 404;
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
}