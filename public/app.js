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