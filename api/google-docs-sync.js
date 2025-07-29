// Vercel serverless function to sync from Google Docs
// Simplified version focused on DOCX download only

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
        const { documentId, credentials } = req.body;
        
        if (!documentId) {
            return res.status(400).json({ error: 'Document ID or name is required' });
        }
        
        console.log(`🔄 Starting Google Docs sync for document: ${documentId}`);
        
        // Import googleapis dynamically to handle serverless environment
        const { google } = await import('googleapis');
        const { GoogleAuth } = await import('google-auth-library');
        
        // Build service account credentials
        let serviceAccountKey;
        
        if (credentials) {
            // Use provided credentials
            serviceAccountKey = credentials;
            console.log('✅ Using provided credentials');
        } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            // Use individual environment variables (recommended approach)
            serviceAccountKey = {
                type: 'service_account',
                project_id: process.env.GOOGLE_PROJECT_ID,
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Fix newlines
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                token_uri: 'https://oauth2.googleapis.com/token',
                auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL)}`,
                universe_domain: 'googleapis.com'
            };
            console.log('✅ Built service account from environment variables');
        } else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
            // Fallback: parse JSON from environment variable
            try {
                const cleanedJson = process.env.GOOGLE_SERVICE_ACCOUNT
                    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
                    .trim();
                serviceAccountKey = JSON.parse(cleanedJson);
                console.log('✅ Using JSON service account from environment');
            } catch (parseError) {
                console.error('❌ Failed to parse service account JSON:', parseError.message);
                return res.status(400).json({ 
                    error: 'Invalid Google service account format',
                    details: 'Please check your GOOGLE_SERVICE_ACCOUNT environment variable'
                });
            }
        } else {
            return res.status(400).json({ 
                error: 'Google service account credentials not configured',
                details: 'Please set up GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables'
            });
        }
        
        // Validate required fields
        if (!serviceAccountKey.private_key || !serviceAccountKey.client_email) {
            return res.status(400).json({ 
                error: 'Invalid service account credentials',
                details: 'Missing private_key or client_email'
            });
        }
        
        console.log('🔐 Initializing Google Auth...');
        
        // Initialize Google Auth
        const auth = new GoogleAuth({
            credentials: serviceAccountKey,
            scopes: [
                'https://www.googleapis.com/auth/documents.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        });
        
        const authClient = await auth.getClient();
        const docs = google.docs({ version: 'v1', auth: authClient });
        const drive = google.drive({ version: 'v3', auth: authClient });
        
        // Helper function to find document by name
        async function findDocumentByName(docName) {
            console.log(`🔍 Searching for document by name: "${docName}"`);
            try {
                const searchResults = await drive.files.list({
                    q: `name='${docName}' and mimeType='application/vnd.google-apps.document'`,
                    fields: 'files(id, name, modifiedTime)'
                });
                
                const files = searchResults.data.files || [];
                if (files.length === 0) {
                    return null;
                }
                
                console.log(`✅ Found document: ${files[0].name} (ID: ${files[0].id})`);
                return files[0].id;
            } catch (error) {
                console.error('❌ Error searching for document:', error.message);
                return null;
            }
        }
        
        // Determine if we have a document ID or name
        let actualDocumentId = documentId;
        
        // If it looks like a document name (contains spaces or special chars), search for it
        if (documentId.includes(' ') || (!documentId.includes('/') && documentId.length < 20)) {
            console.log('📛 Input appears to be a document name, searching...');
            const foundId = await findDocumentByName(documentId);
            if (!foundId) {
                return res.status(404).json({ 
                    error: 'Document not found by name',
                    details: `Could not find a Google Doc named "${documentId}". Please check the name and ensure it's shared with the service account.`
                });
            }
            actualDocumentId = foundId;
        } else if (documentId.includes('/')) {
            // Extract document ID from URL
            const patterns = [
                /\/document\/d\/([a-zA-Z0-9-_]+)/,
                /\/d\/([a-zA-Z0-9-_]+)/,
                /id=([a-zA-Z0-9-_]+)/
            ];
            
            for (const pattern of patterns) {
                const match = documentId.match(pattern);
                if (match) {
                    actualDocumentId = match[1];
                    console.log(`📄 Extracted document ID from URL: ${actualDocumentId}`);
                    break;
                }
            }
        }
        
        console.log(`📄 Using document ID: ${actualDocumentId}`);
        console.log('📄 Verifying document access...');
        
        // First, verify the document exists and is accessible
        try {
            const docResponse = await docs.documents.get({
                documentId: actualDocumentId,
                fields: 'title,revisionId'
            });
            
            if (!docResponse.data) {
                return res.status(404).json({ 
                    error: 'Document not found',
                    details: 'The document may not exist or you may not have access to it'
                });
            }
            
            console.log(`✅ Document found: ${docResponse.data.title}`);
            
        } catch (docError) {
            console.error('❌ Document access error:', docError.message);
            
            if (docError.code === 403) {
                return res.status(403).json({ 
                    error: 'Access denied to document',
                    details: 'Please ensure the document is shared with the service account email'
                });
            } else if (docError.code === 404) {
                return res.status(404).json({ 
                    error: 'Document not found',
                    details: 'Please check the document ID and ensure it exists'
                });
            } else {
                return res.status(500).json({ 
                    error: 'Failed to access document',
                    details: docError.message
                });
            }
        }
        
        console.log('📥 Exporting document as DOCX...');
        
        // Export the document as DOCX
        const exportResponse = await drive.files.export({
            fileId: actualDocumentId,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        
        if (!exportResponse.data) {
            return res.status(500).json({ 
                error: 'Failed to export document',
                details: 'The document could not be exported as DOCX'
            });
        }
        
        console.log('📊 Getting document metadata...');
        
        // Get document metadata
        const fileInfo = await drive.files.get({
            fileId: actualDocumentId,
            fields: 'name,modifiedTime,size,version,mimeType'
        });
        
        // Convert the DOCX data to base64 for transmission
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
        const docxBase64 = docxBuffer.toString('base64');
        
        const response = {
            success: true,
            document: {
                id: actualDocumentId,
                name: fileInfo.data.name || 'Google Doc',
                modifiedTime: fileInfo.data.modifiedTime,
                size: fileInfo.data.size,
                version: fileInfo.data.version,
                mimeType: fileInfo.data.mimeType,
                originalInput: documentId // Keep track of what the user entered
            },
            docx: {
                data: docxBase64,
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                size: docxBuffer.length
            },
            metadata: {
                exportedAt: new Date().toISOString(),
                exportSize: docxBuffer.length
            }
        };
        
        console.log(`🎉 Successfully exported document: ${fileInfo.data.name} (${docxBuffer.length} bytes)`);
        
        // Save the DOCX file to Google Drive for future use
        try {
            console.log('💾 Saving DOCX to Google Drive...');
            
            // Create or find "GTI_SOP_Downloads" folder
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
                console.log(`📁 Created folder: GTI_SOP_Downloads (${folderId})`);
            } else {
                folderId = folderSearchResponse.data.files[0].id;
                console.log(`📁 Using existing folder: GTI_SOP_Downloads (${folderId})`);
            }
            
            // Save the DOCX file to the folder
            const fileName = `${fileInfo.data.name}_${new Date().toISOString().split('T')[0]}.docx`;
            const uploadResponse = await drive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [folderId],
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                },
                media: {
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    body: docxBuffer
                },
                fields: 'id, name, webViewLink'
            });
            
            console.log(`✅ Saved DOCX to Drive: ${uploadResponse.data.name} (${uploadResponse.data.id})`);
            
            // Add storage info to response
            response.storage = {
                saved: true,
                driveFileId: uploadResponse.data.id,
                driveFileName: uploadResponse.data.name,
                driveLink: uploadResponse.data.webViewLink,
                folderName: 'GTI_SOP_Downloads'
            };
            
        } catch (storageError) {
            console.error('⚠️ Failed to save to Drive:', storageError.message);
            response.storage = {
                saved: false,
                error: storageError.message
            };
        }
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('❌ Google Docs sync error:', error);
        
        let errorMessage = 'Failed to sync from Google Docs';
        let statusCode = 500;
        let errorDetails = error.message;
        
        // Handle specific error types
        if (error.code === 403) {
            errorMessage = 'Access denied';
            errorDetails = 'Please check service account permissions and document sharing settings';
            statusCode = 403;
        } else if (error.code === 404) {
            errorMessage = 'Document not found';
            errorDetails = 'Please verify the document ID and access permissions';
            statusCode = 404;
        } else if (error.code === 429) {
            errorMessage = 'Rate limit exceeded';
            errorDetails = 'Too many requests. Please try again later';
            statusCode = 429;
        } else if (error.code === 401) {
            errorMessage = 'Authentication failed';
            errorDetails = 'Please check your service account credentials';
            statusCode = 401;
        }
        
        const errorResponse = {
            error: errorMessage,
            details: errorDetails,
            timestamp: new Date().toISOString()
        };
        
        // Include stack trace in development
        if (process.env.NODE_ENV === 'development') {
            errorResponse.stack = error.stack;
        }
        
        res.status(statusCode).json(errorResponse);
    }
}