/**
 * Google Docs Sync Module
 * Handles downloading DOCX files from Google Docs
 */

class GoogleDocsSync {
    constructor() {
        this.isProcessing = false;
        this.isDriveUpdating = false;
        this.lastSyncTime = null;
        this.lastDriveUpdate = null;
        this.documentInfo = null;
        this.docxData = null;
        this.driveFileInfo = null;
        this.apiUrl = '/api/google-docs-sync';
        this.driveApiUrl = '/api/update-drive';
        this.githubApiUrl = '/api/save-to-github';
    }

    /**
     * Initialize the Google Docs sync functionality
     */
    init() {
        console.log('🚀 Initializing Google Docs Sync...');
        this.setupEventListeners();
        this.loadSavedState();
        this.updateUI();
    }

    /**
     * Set up event listeners for the UI elements
     */
    setupEventListeners() {
        const syncButton = document.getElementById('syncDocButton');
        const downloadButton = document.getElementById('downloadDocxButton');
        const updateDriveButton = document.getElementById('updateDriveButton');
        const previewDownloadButton = document.getElementById('previewDownloadButton');

        if (syncButton) {
            syncButton.addEventListener('click', () => this.syncDocument());
        }

        if (downloadButton) {
            downloadButton.addEventListener('click', () => this.downloadDocx());
        }

        if (updateDriveButton) {
            updateDriveButton.addEventListener('click', () => this.updateGoogleDrive());
        }

        if (previewDownloadButton) {
            previewDownloadButton.addEventListener('click', () => this.downloadDocx());
        }
    }

    /**
     * Load previously saved sync state from localStorage
     */
    loadSavedState() {
        try {
            const savedState = localStorage.getItem('googleDocsSync');
            if (savedState) {
                const state = JSON.parse(savedState);
                this.lastSyncTime = state.lastSyncTime;
                this.lastDriveUpdate = state.lastDriveUpdate;
                this.documentInfo = state.documentInfo;
                this.docxData = state.docxData;
                this.driveFileInfo = state.driveFileInfo;
            }
        } catch (error) {
            console.warn('Failed to load saved sync state:', error);
        }
    }

    /**
     * Save current sync state to localStorage (without large DOCX data)
     */
    saveSyncState() {
        try {
            const state = {
                lastSyncTime: this.lastSyncTime,
                lastDriveUpdate: this.lastDriveUpdate,
                documentInfo: this.documentInfo,
                // Don't save DOCX data to avoid quota exceeded errors
                docxData: this.docxData ? { size: this.docxData.size, mimeType: this.docxData.mimeType } : null,
                driveFileInfo: this.driveFileInfo
            };
            localStorage.setItem('googleDocsSync', JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save sync state:', error);
        }
    }

    /**
     * Process document input - can be URL, ID, or document name
     */
    processDocumentInput(input) {
        if (!input) return null;
        
        const trimmedInput = input.trim();
        
        // If it contains a URL, extract the document ID
        if (trimmedInput.includes('/')) {
            const patterns = [
                /\/document\/d\/([a-zA-Z0-9-_]+)/,
                /\/d\/([a-zA-Z0-9-_]+)/,
                /id=([a-zA-Z0-9-_]+)/
            ];
            
            for (const pattern of patterns) {
                const match = trimmedInput.match(pattern);
                if (match) {
                    return match[1];
                }
            }
        }
        
        // Return as-is - could be document ID or document name
        // The API will determine which it is
        return trimmedInput;
    }

    /**
     * Sync document from Google Docs
     */
    async syncDocument() {
        if (this.isProcessing) {
            this.showNotification('Sync already in progress...', 'warning');
            return;
        }

        const docInput = document.getElementById('googleDocUrl');
        const documentInput = docInput?.value?.trim();

        if (!documentInput) {
            this.showNotification('Please enter a Google Doc URL, ID, or name', 'error');
            return;
        }

        const processedInput = this.processDocumentInput(documentInput);
        if (!processedInput) {
            this.showNotification('Invalid input format', 'error');
            return;
        }

        this.isProcessing = true;
        this.updateUI();
        this.showLoading('Connecting to Google Docs...');

        try {
            this.updateProgress(10, 'Validating document...');
            
            // Check if we're running locally and use mock API
            const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            
            if (isLocalhost && typeof window.mockGoogleDocsSync === 'function') {
                // Use mock API for local testing
                this.updateProgress(30, 'Using mock API for local testing...');
                const data = await window.mockGoogleDocsSync(processedInput);
                this.updateProgress(70, 'Mock data received...');
                
                // Simulate the same flow as real API
                if (!data.success) {
                    throw new Error(data.error || 'Mock API error');
                }
                
                this.updateProgress(80, 'Processing mock document data...');
                
                // Store the document info and DOCX data
                this.documentInfo = data.document;
                this.docxData = data.docx;
                this.lastSyncTime = new Date().toISOString();

                this.updateProgress(100, 'Mock sync completed successfully!');

                // Save state
                this.saveSyncState();

                // Update UI
                this.updateUI();

                this.showNotification(`✅ Mock sync successful: ${this.documentInfo.name} (Local Testing Mode)`, 'success');
                
            } else {
                // Use real API for production
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        documentId: processedInput
                    })
                });

                this.updateProgress(50, 'Downloading document...');

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Unknown error occurred');
                }

                this.updateProgress(80, 'Processing document data...');

                // Store the document info and DOCX data
                this.documentInfo = data.document;
                this.docxData = data.docx;
                this.lastSyncTime = new Date().toISOString();

                this.updateProgress(100, 'Sync completed successfully!');

                // Save state
                this.saveSyncState();

                // Update UI
                this.updateUI();

                this.showNotification(`Successfully synced: ${this.documentInfo.name}`, 'success');
            }
            
        } catch (error) {
            console.error('Sync error:', error);
            this.showNotification(`Sync failed: ${error.message}`, 'error');
        } finally {
            this.isProcessing = false;
            this.hideLoading();
            this.updateUI();
        }
    }

    /**
     * Save file to GitHub (alternative to Google Drive)
     */
    async updateGoogleDrive() {
        if (this.isDriveUpdating) {
            this.showNotification('GitHub save already in progress...', 'warning');
            return;
        }

        if (!this.documentInfo) {
            this.showNotification('No document available to save. Please sync first.', 'warning');
            return;
        }

        this.isDriveUpdating = true;
        this.updateUI();
        this.showLoading('Saving to GitHub...');

        try {
            this.updateProgress(10, 'Preparing GitHub upload...');
            
            // Add cache-busting parameter to avoid 404 caching issues
            const apiUrl = `${this.githubApiUrl}?t=${Date.now()}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    documentId: this.documentInfo.id,
                    documentInfo: this.documentInfo
                })
            });

            this.updateProgress(70, 'Uploading to GitHub...');

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Unknown error occurred');
            }

            this.updateProgress(100, 'GitHub save completed!');

            // Store the github file info
            this.driveFileInfo = {
                ...data.githubFile,
                url: data.githubFile.url,
                downloadUrl: data.githubFile.downloadUrl
            };
            this.lastDriveUpdate = new Date().toISOString();

            // Save state
            this.saveSyncState();

            // Update UI
            this.updateUI();

            const actionText = data.githubFile.action === 'updated' ? 'updated' : 'created';
            this.showNotification(`✅ Successfully ${actionText} file on GitHub: ${data.githubFile.name}`, 'success');
            
        } catch (error) {
            console.error('GitHub save error:', error);
            this.showNotification(`GitHub save failed: ${error.message}`, 'error');
        } finally {
            this.isDriveUpdating = false;
            this.hideLoading();
            this.updateUI();
        }
    }

    /**
     * Download the synced DOCX file
     */
    downloadDocx() {
        if (!this.docxData || !this.documentInfo) {
            this.showNotification('No document available to download. Please sync first.', 'warning');
            return;
        }

        try {
            // Convert base64 to blob
            const binaryString = atob(this.docxData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const blob = new Blob([bytes], { 
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
            });

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${this.documentInfo.name}.docx`;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up URL
            URL.revokeObjectURL(url);

            this.showNotification('Document downloaded successfully!', 'success');
            
        } catch (error) {
            console.error('Download error:', error);
            this.showNotification(`Download failed: ${error.message}`, 'error');
        }
    }

    /**
     * Update the UI based on current state
     */
    updateUI() {
        // Update status
        const syncStatus = document.getElementById('syncStatus');
        const lastSyncTime = document.getElementById('lastSyncTime');
        const fileSize = document.getElementById('fileSize');

        if (syncStatus) {
            if (this.isProcessing) {
                syncStatus.textContent = 'Syncing...';
                syncStatus.className = 'status-value status-loading';
            } else if (this.documentInfo) {
                syncStatus.textContent = 'Ready';
                syncStatus.className = 'status-value status-success';
            } else {
                syncStatus.textContent = 'Ready';
                syncStatus.className = 'status-value status-idle';
            }
        }

        if (lastSyncTime) {
            if (this.lastSyncTime) {
                const date = new Date(this.lastSyncTime);
                lastSyncTime.textContent = date.toLocaleString();
            } else {
                lastSyncTime.textContent = 'Never';
            }
        }

        if (fileSize && this.docxData) {
            const size = this.formatFileSize(this.docxData.size);
            fileSize.textContent = size;
        }

        // Update buttons
        const downloadButton = document.getElementById('downloadDocxButton');
        const updateDriveButton = document.getElementById('updateDriveButton');
        const syncButton = document.getElementById('syncDocButton');

        if (downloadButton) {
            downloadButton.disabled = !this.docxData || this.isProcessing;
        }

        if (updateDriveButton) {
            // GitHub save only needs documentInfo (document ID), not the local DOCX data
            const shouldDisable = !this.documentInfo || this.isProcessing || this.isDriveUpdating;
            console.log('🔍 GitHub button state:', {
                documentInfo: !!this.documentInfo,
                isProcessing: this.isProcessing,
                isDriveUpdating: this.isDriveUpdating,
                shouldDisable: shouldDisable
            });
            
            updateDriveButton.disabled = shouldDisable;
            if (this.isDriveUpdating) {
                updateDriveButton.innerHTML = '<span class="btn-icon">⏳</span>Saving to GitHub...';
            } else {
                updateDriveButton.innerHTML = '<span class="btn-icon">📁</span>Save to GitHub';
            }
        }

        if (syncButton) {
            syncButton.disabled = this.isProcessing || this.isDriveUpdating;
            if (this.isProcessing) {
                syncButton.innerHTML = '<span class="btn-icon">⏳</span>Syncing...';
            } else {
                syncButton.innerHTML = '<span class="btn-icon">☁️</span>Sync from Google Docs';
            }
        }

        // Update Drive status
        const driveStatus = document.getElementById('driveStatus');
        if (driveStatus) {
            if (this.isDriveUpdating) {
                driveStatus.textContent = 'Updating...';
                driveStatus.className = 'status-value status-loading';
            } else if (this.driveFileInfo) {
                const updateDate = new Date(this.lastDriveUpdate).toLocaleDateString();
                driveStatus.textContent = `Saved ${updateDate}`;
                driveStatus.className = 'status-value status-success';
            } else {
                driveStatus.textContent = 'Not saved';
                driveStatus.className = 'status-value status-idle';
            }
        }

        // Update document preview
        this.updateDocumentPreview();
    }

    /**
     * Update the document preview section
     */
    updateDocumentPreview() {
        const welcomeMessage = document.getElementById('welcomeMessage');
        const documentPreview = document.getElementById('documentPreview');

        if (this.documentInfo && this.docxData) {
            // Hide welcome message and show document preview
            if (welcomeMessage) welcomeMessage.classList.add('hidden');
            if (documentPreview) {
                documentPreview.classList.remove('hidden');
                
                // Update document info
                const documentName = document.getElementById('documentName');
                if (documentName) {
                    documentName.textContent = this.documentInfo.name;
                }
                
                // Show Drive storage info if available
                const downloadStatus = document.getElementById('downloadStatus');
                if (downloadStatus && this.storage) {
                    if (this.storage.saved) {
                        downloadStatus.textContent = `Ready for download (Also saved to Drive: ${this.storage.folderName})`;
                    } else {
                        downloadStatus.textContent = 'Ready for download';
                    }
                }
            }
        } else {
            // Show welcome message and hide document preview
            if (welcomeMessage) welcomeMessage.classList.remove('hidden');
            if (documentPreview) documentPreview.classList.add('hidden');
        }
    }

    /**
     * Update progress indicator
     */
    updateProgress(percentage, text) {
        const progressSection = document.getElementById('progressSection');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        if (progressSection && percentage > 0) {
            progressSection.classList.remove('hidden');
        }

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = text || '';
        }

        // Hide progress after completion
        if (percentage >= 100) {
            setTimeout(() => {
                if (progressSection) {
                    progressSection.classList.add('hidden');
                }
            }, 2000);
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(text = 'Processing...') {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');

        if (loadingText) {
            loadingText.textContent = text;
        }

        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.textContent = message;
        notification.className = `notification ${type} show`;

        // Auto-hide after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }

    /**
     * Format file size in human-readable format
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }

    /**
     * Clear all saved data
     */
    clearData() {
        this.documentInfo = null;
        this.docxData = null;
        this.lastSyncTime = null;
        
        try {
            localStorage.removeItem('googleDocsSync');
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
        }
        
        this.updateUI();
        this.showNotification('All data cleared', 'info');
    }
}

// Export for use in other modules
window.GoogleDocsSync = GoogleDocsSync;