// Vercel serverless function to update files on Google Drive
// Saves DOCX files to organized folders in Google Drive

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
        const { docxData, documentInfo } = req.body;
        
        if (!docxData || !documentInfo) {
            return res.status(400).json({ error: 'DOCX data and document info are required' });
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
            scopes: ['https://www.googleapis.com/auth/drive.file']
        });
        
        const authClient = await auth.getClient();
        const drive = google.drive({ version: 'v3', auth: authClient });
        
        // Convert base64 DOCX data back to buffer
        console.log('🔄 Processing DOCX data...');
        const docxBuffer = Buffer.from(docxData.data, 'base64');
        
        // Create or find "GTI_SOP_Downloads" folder
        console.log('📁 Finding/creating GTI_SOP_Downloads folder...');
        let folderId;
        const folderSearchResponse = await drive.files.list({
            q: "name='GTI_SOP_Downloads' and mimeType='application/vnd.google-apps.folder'",
            fields: 'files(id, name)'
        });
        
        if (folderSearchResponse.data.files.length === 0) {
            // Create the folder
            const folderResponse = await drive.files.create({
                requestBody: {
                    name: 'GTI_SOP_Downloads',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            folderId = folderResponse.data.id;
            console.log(`✅ Created folder: GTI_SOP_Downloads (${folderId})`);
        } else {
            folderId = folderSearchResponse.data.files[0].id;
            console.log(`✅ Using existing folder: GTI_SOP_Downloads (${folderId})`);
        }
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `${documentInfo.name}_${timestamp}.docx`;
        
        // Check if file with same name exists (for updating vs creating)
        const existingFilesResponse = await drive.files.list({
            q: `name='${fileName}' and parents in '${folderId}'`,
            fields: 'files(id, name)'
        });
        
        let uploadResponse;
        
        if (existingFilesResponse.data.files.length > 0) {
            // Update existing file
            const existingFileId = existingFilesResponse.data.files[0].id;
            console.log(`🔄 Updating existing file: ${fileName} (${existingFileId})`);
            
            uploadResponse = await drive.files.update({
                fileId: existingFileId,
                media: {
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    body: docxBuffer
                },
                fields: 'id, name, webViewLink, modifiedTime'
            });
        } else {
            // Create new file
            console.log(`📄 Creating new file: ${fileName}`);
            
            uploadResponse = await drive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [folderId],
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                },
                media: {
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    body: docxBuffer
                },
                fields: 'id, name, webViewLink, modifiedTime'
            });
        }
        
        console.log(`✅ Successfully saved to Drive: ${uploadResponse.data.name} (${uploadResponse.data.id})`);
        
        const response = {
            success: true,
            driveFile: {
                id: uploadResponse.data.id,
                name: uploadResponse.data.name,
                webViewLink: uploadResponse.data.webViewLink,
                modifiedTime: uploadResponse.data.modifiedTime,
                folderName: 'GTI_SOP_Downloads',
                action: existingFilesResponse.data.files.length > 0 ? 'updated' : 'created'
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