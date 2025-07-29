/**
 * Main Application Module
 * Initializes and coordinates all app functionality
 */

class GTISOPApp {
    constructor() {
        this.googleDocsSync = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.isInitialized) {
            console.warn('App already initialized');
            return;
        }

        console.log('🚀 Initializing GTI SOP Assistant - Try 2...');

        try {
            // Initialize Google Docs Sync
            this.googleDocsSync = new GoogleDocsSync();
            this.googleDocsSync.init();

            // Initialize semantic chunking
            this.initSemanticChunking();

            // Set up global event listeners
            this.setupGlobalEventListeners();

            // Mark as initialized
            this.isInitialized = true;

            console.log('✅ GTI SOP Assistant initialized successfully');
            this.showInitializationSuccess();

        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.showError('Failed to initialize application', error.message);
        }
    }

    /**
     * Set up global event listeners
     */
    setupGlobalEventListeners() {
        // Handle window resize
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));

        // Handle visibility change (for pausing/resuming operations)
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });

        // Handle unload (save state before closing)
        window.addEventListener('beforeunload', () => {
            this.handleBeforeUnload();
        });
    }

    /**
     * Handle window resize
     */
    handleResize() {
        // Adjust layout for mobile if needed
        const width = window.innerWidth;
        if (width < 768) {
            document.body.classList.add('mobile');
        } else {
            document.body.classList.remove('mobile');
        }
    }

    /**
     * Handle visibility change
     */
    handleVisibilityChange() {
        if (document.hidden) {
            console.log('🔄 App went to background');
        } else {
            console.log('🔄 App came to foreground');
            // Optionally refresh data when coming back
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + R: Refresh sync
        if ((event.ctrlKey || event.metaKey) && event.key === 'r' && event.shiftKey) {
            event.preventDefault();
            if (this.googleDocsSync && !this.googleDocsSync.isProcessing) {
                this.googleDocsSync.syncDocument();
            }
        }

        // Ctrl/Cmd + D: Download DOCX
        if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
            event.preventDefault();
            if (this.googleDocsSync && this.googleDocsSync.docxData) {
                this.googleDocsSync.downloadDocx();
            }
        }

        // Escape: Close any open dialogs/notifications
        if (event.key === 'Escape') {
            this.closeNotifications();
        }
    }

    /**
     * Handle before unload
     */
    handleBeforeUnload() {
        // Save any pending state
        if (this.googleDocsSync) {
            this.googleDocsSync.saveSyncState();
        }
    }

    /**
     * Close all notifications
     */
    closeNotifications() {
        const notifications = document.querySelectorAll('.notification.show');
        notifications.forEach(notification => {
            notification.classList.remove('show');
        });
    }

    /**
     * Show initialization success message
     */
    showInitializationSuccess() {
        // Add a subtle success indicator
        const header = document.querySelector('.header');
        if (header) {
            header.classList.add('initialized');
        }

        // Show a brief welcome notification
        setTimeout(() => {
            this.showNotification('GTI SOP Assistant ready!', 'success');
        }, 500);
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.textContent = message;
        notification.className = `notification ${type} show`;

        // Auto-hide after 3 seconds for success messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }
    }

    /**
     * Show error message
     */
    showError(title, details) {
        console.error(`${title}: ${details}`);
        this.showNotification(`${title}: ${details}`, 'error');
    }

    /**
     * Utility: Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Initialize semantic chunking functionality
     */
    initSemanticChunking() {
        console.log('🧩 Initializing semantic chunking...');
        
        const processButton = document.getElementById('processChunksButton');
        
        if (processButton) {
            processButton.addEventListener('click', () => this.processSemanticChunks());
        }

        // Button is always enabled since it downloads from GitHub
        console.log('✅ Semantic chunking initialized - downloads from GitHub');
    }


    /**
     * Process semantic chunks from the DOCX file
     */
    async processSemanticChunks() {
        console.log('🧩 Starting semantic chunking process...');
        
        const chunkSize = document.getElementById('chunkSize')?.value || 800;
        const maxChunkSize = document.getElementById('maxChunkSize')?.value || 1200;
        
        // Update UI to processing state
        this.updateChunkingStatus('Processing...', 'processing');
        this.showLoadingOverlay('Processing semantic chunks...');
        
        try {
            const response = await fetch('./api/semantic-chunking.js', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chunkSize: parseInt(chunkSize),
                    maxChunkSize: parseInt(maxChunkSize),
                    overlapSize: 150
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                // Update UI with results
                this.updateChunkingResults(result.statistics);
                this.updateChunkingStatus('Complete', 'success');
                this.showNotification('Semantic chunks processed and uploaded to GitHub successfully!', 'success');
            } else {
                throw new Error(result.error || 'Processing failed');
            }
            
        } catch (error) {
            console.error('Semantic chunking error:', error);
            this.updateChunkingStatus('Failed', 'error');
            this.showError('Failed to process chunks', error.message);
        } finally {
            this.hideLoadingOverlay();
        }
    }


    /**
     * Update chunking status in UI
     */
    updateChunkingStatus(status, type = 'idle') {
        const statusElement = document.getElementById('chunkingStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `status-value status-${type}`;
        }
    }

    /**
     * Update chunking results in UI
     */
    updateChunkingResults(statistics) {
        const chunksCount = document.getElementById('chunksCount');
        const imagesCount = document.getElementById('imagesCount');
        const lastChunkingTime = document.getElementById('lastChunkingTime');
        
        if (chunksCount) {
            chunksCount.textContent = statistics.totalChunks || '-';
        }
        
        if (imagesCount) {
            imagesCount.textContent = statistics.totalImages || '-';
        }
        
        if (lastChunkingTime) {
            lastChunkingTime.textContent = new Date().toLocaleTimeString();
        }
    }

    /**
     * Show loading overlay
     */
    showLoadingOverlay(message) {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        if (overlay) {
            overlay.classList.remove('hidden');
        }
        
        if (loadingText && message) {
            loadingText.textContent = message;
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            googleDocsSync: {
                hasDocumentData: !!(this.googleDocsSync && this.googleDocsSync.docxData),
                lastSyncTime: this.googleDocsSync ? this.googleDocsSync.lastSyncTime : null,
                isProcessing: this.googleDocsSync ? this.googleDocsSync.isProcessing : false
            }
        };
    }

    /**
     * Reset application state
     */
    reset() {
        console.log('🔄 Resetting application state...');
        
        if (this.googleDocsSync) {
            this.googleDocsSync.clearData();
        }

        this.showNotification('Application reset complete', 'info');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 DOM loaded, initializing app...');
    
    // Create global app instance
    window.gtiApp = new GTISOPApp();
    
    // Initialize the app
    window.gtiApp.init().catch(error => {
        console.error('Failed to initialize app:', error);
        
        // Show error to user
        const notification = document.getElementById('notification');
        if (notification) {
            notification.textContent = `Initialization failed: ${error.message}`;
            notification.className = 'notification error show';
        }
    });
});

// Handle any uncaught errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = `An error occurred: ${event.error.message}`;
        notification.className = 'notification error show';
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = `Promise error: ${event.reason}`;
        notification.className = 'notification error show';
    }
});

// Export for debugging/testing
window.GTISOPApp = GTISOPApp;