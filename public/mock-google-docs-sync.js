// Mock API for local testing
// This simulates the Google Docs sync functionality without requiring real credentials

function createMockResponse(documentInput) {
    // Simulate processing time
    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    
    return new Promise((resolve) => {
        setTimeout(() => {
            // Create a mock DOCX file (just a simple text file encoded as base64)
            const mockDocxContent = `Mock DOCX content for: ${documentInput}\n\nThis is a test document created for local development.\nIt simulates the structure of a real DOCX file download.`;
            const mockBase64 = btoa(mockDocxContent);
            
            const response = {
                success: true,
                document: {
                    id: 'mock-document-id-12345',
                    name: documentInput.includes('GTI') ? 'GTI Data Base and SOP' : 'Mock Document',
                    modifiedTime: new Date().toISOString(),
                    size: '156789',
                    version: '42',
                    mimeType: 'application/vnd.google-apps.document',
                    originalInput: documentInput
                },
                docx: {
                    data: mockBase64,
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    size: mockBase64.length
                },
                metadata: {
                    exportedAt: new Date().toISOString(),
                    exportSize: mockBase64.length,
                    isMockData: true
                }
            };
            
            resolve(response);
        }, delay);
    });
}

// Export for browser environment
if (typeof window !== 'undefined') {
    window.mockGoogleDocsSync = createMockResponse;
}