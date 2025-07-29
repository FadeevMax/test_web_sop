# GTI SOP Assistant - Web Application Try 2

## Overview

This web application provides an enhanced interface for managing GTI Standard Operating Procedures (SOPs) with advanced semantic chunking capabilities. The application can download DOCX files from Google Docs, process them into semantic chunks with embedded image placeholders, and upload the results to GitHub.

## Key Features

### 🔄 Google Docs Integration
- Download DOCX files directly from Google Docs using document URL, ID, or name
- Real-time sync status and progress tracking
- Automatic caching for offline processing

### 🧩 Semantic Chunking Engine
- **Configurable chunk sizes** (300-2000 characters)
- **Image placeholder integration** - Images are marked within text using `[IMAGE_PLACEHOLDER_N]` markers
- **Smart image positioning** - Only includes images that appear in middle or after chunk text
- **Tab separation detection** - Preserves Google Doc tab structure for better organization
- **Context-aware chunking** - Maintains state, section, and topic coherence

### 📁 GitHub Integration
- Automatic upload of processed chunks and images
- Version control for semantic data
- Comprehensive documentation generation

## Semantic Chunking Logic

### 1. Image Placement Strategy

**Core Principle**: Images are embedded directly in chunk text using placeholder markers.

```
Original text flow: "Process the order. [IMAGE_PLACEHOLDER_1] Verify the details."
```

**Image Position Rules**:
- ✅ **Include**: Images appearing in middle or after chunk text
- ❌ **Exclude**: Images appearing before chunk text
- 🔗 **Group**: Multiple consecutive unlabeled images are grouped with preceding text

**Example**:
```
Text → Image1 → Text → Image2 → RelevantText → Image3 → Image4 → Image5 → Text
Result: Shows Images 3, 4, 5 (after relevant text)
```

### 2. Chunk Size Management

- **Target Size**: Configurable (default: 800 characters)
- **Maximum Size**: Hard limit (default: 1200 characters) 
- **Minimum Size**: 300 characters to ensure meaningful content
- **Overlap**: 150 characters between chunks for context preservation

### 3. Tab Separation Handling

The system attempts to detect original Google Doc tab boundaries:

- **Separate Processing**: Different tabs cannot be merged into same chunk
- **Section Boundaries**: Detected through formatting and content patterns
- **Topic Coherence**: Prevents cross-contamination between different subjects

**Detection Methods**:
- Header text patterns (e.g., "OHIO OPERATIONS", "MARYLAND PROCEDURES")
- Formatting changes (style, indentation)
- Context switches (state, section, topic changes)

### 4. Context Preservation

Each chunk maintains rich metadata:

```json
{
  "states": ["OH", "MD"],           // Geographic locations
  "sections": ["RISE", "REGULAR"],  // Order types  
  "topics": ["PRICING", "DELIVERY"], // Subject categories
  "tab_section": "Ohio Operations"   // Original tab context
}
```

**Context Detection Patterns**:
- **States**: OH, MD, NJ, IL, NY, NV, MA
- **Sections**: RISE (internal), REGULAR (wholesale), GENERAL
- **Topics**: PRICING, BATTERIES, BATCH_SUB, DELIVERY_DATE, ORDER_LIMIT, etc.

## File Structure

```
web_app_try2/
├── index.html                 # Main application interface
├── api/
│   ├── semantic-chunking.js   # Core chunking API endpoint
│   ├── docx-processor.js      # DOCX processing logic
│   ├── upload-chunks-github.js # GitHub upload functionality
│   └── ...
├── js/
│   ├── app.js                 # Main application logic
│   └── googleDocsSync.js      # Google Docs integration
├── cache/
│   └── downloaded_doc.docx    # Cached DOCX file
└── semantic_output/
    ├── semantic_chunks.json   # Processed chunks with metadata
    ├── images/                # Extracted images
    └── README.md              # Auto-generated documentation
```

## API Endpoints

### POST `/api/semantic-chunking.js`
Process DOCX file into semantic chunks.

**Request**:
```json
{
  "chunkSize": 800,
  "maxChunkSize": 1200,
  "overlapSize": 150
}
```

**Response**:
```json
{
  "success": true,
  "statistics": {
    "totalChunks": 25,
    "totalImages": 45,
    "averageChunkSize": 784,
    "tabsDetected": 5,
    "imageMarkers": 45
  }
}
```

### POST `/api/upload-chunks-github.js`
Upload processed chunks to GitHub repository.

**Requirements**:
- `GITHUB_TOKEN` environment variable
- `GITHUB_REPO` environment variable (format: username/repo)
- `GITHUB_BRANCH` environment variable (optional, defaults to 'main')

## JSON Schema

Each chunk follows this structure:

```json
{
  "chunk_id": 0,
  "text": "Text with [IMAGE_PLACEHOLDER_1] embedded markers...",
  "images": [
    {
      "filename": "image_1.png",
      "path": "semantic_output/images/image_1.png",
      "label": "Image 1: Description",
      "number": 1,
      "context_text": "Surrounding text context",
      "state": "OH",
      "section": "RISE", 
      "topic": "PRICING",
      "position_in_text": "after_sentence"
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
    "tab_section": "Ohio Operations",
    "image_markers": 1
  }
}
```

## Usage Instructions

### 1. Sync Document from Google Docs (One-time setup)
1. Enter Google Doc URL, ID, or name in the input field
2. Click "Sync from Google Docs" 
3. Wait for download completion
4. Click "Save to GitHub" to store DOCX as `GTI_Data_Base_and_SOP.docx`

### 2. Process Semantic Chunks (Main workflow)
1. Set desired chunk size (recommended: 800-1200 characters)
2. Click "Process & Upload Chunks"
3. System will:
   - Download latest `GTI_Data_Base_and_SOP.docx` from GitHub
   - Process into semantic chunks with image placeholders
   - Upload results back to GitHub (overwrites previous versions)
   - Generate updated documentation

### File Management
- **Source**: `GTI_Data_Base_and_SOP.docx` (always same name, overwrites daily updates)
- **Output**: `semantic_chunks.json` (processed data, overwrites on each run)
- **Images**: `images/` folder (extracted images, overwrites on each run) 
- **Docs**: `semantic_README.md` (auto-generated documentation)

## Configuration

### Environment Variables
```bash
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_REPO=username/repository-name
GITHUB_BRANCH=main  # optional

# Google Cloud credentials
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_PRIVATE_KEY_ID=your-key-id
```

### Chunk Size Recommendations
- **Small chunks (300-500)**: Better for specific queries, more granular search
- **Medium chunks (800-1200)**: Optimal for AI processing, balanced context
- **Large chunks (1500-2000)**: More context but may exceed model limits

## Advanced Features

### Image Position Detection
The system tracks exactly where images appear relative to text:

- `before_chunk`: Image appears before chunk text (excluded)
- `middle_chunk`: Image appears within chunk text (included)
- `after_chunk`: Image appears after chunk text (included)
- `consecutive_after`: Multiple images after same text (all included)

### Tab Section Detection
Automatically identifies document sections that originated from different Google Doc tabs:

- Header pattern matching
- Content context analysis
- Formatting change detection
- Prevents mixing unrelated content

### Context Change Detection
Tracks when document context shifts:

- State changes (OH → MD)
- Section changes (RISE → REGULAR)
- Topic changes (PRICING → DELIVERY)
- Tab changes (Ohio Ops → Maryland Ops)

## Google Cloud Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Drive API
   - Google Docs API

### Step 2: Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Fill in the details and create
4. Click on the created service account
5. Go to **Keys** tab > **Add Key** > **Create New Key**
6. Choose **JSON** format and download the file

### Step 3: Extract Credentials

From the downloaded JSON file, extract these values for your environment variables:

```json
{
  "client_email": "your-service-account@project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  "project_id": "your-project-id",
  "client_id": "your-client-id",
  "private_key_id": "your-key-id"
}
```

### Step 4: Share Google Doc

Share your Google Doc with the service account email address with **Viewer** permissions.

## Troubleshooting

### Common Issues

**"DOCX file not found"**
- Ensure document is synced from Google Docs first
- Check cache directory for downloaded_doc.docx

**"Failed to process chunks"**
- Verify chunk size settings are within valid range
- Check console for detailed error messages

**"GitHub upload failed"**
- Verify GitHub token has repository write permissions
- Check repository name format (username/repo)
- Ensure repository exists and is accessible

**"Access denied" error**:
- Make sure your Google Doc is shared with the service account email
- Verify the service account has the correct permissions

### Debug Information

The application provides detailed debug information:
- Processing statistics in UI
- Console logging for all operations
- Error details with specific failure reasons

## Development

### Adding New Features

1. **New API endpoints**: Add to `/api/` directory
2. **UI components**: Update `index.html` and `js/app.js`
3. **Processing logic**: Modify `api/docx-processor.js`

### Testing

The application includes example chunks with:
- Various image placement scenarios
- Different state/section/topic combinations
- Tab separation examples
- Context change boundaries

## Security Notes

- Never commit service account credentials to version control
- Use environment variables for all sensitive information
- Regularly rotate service account keys
- Only grant minimum necessary permissions

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

*Generated by GTI SOP Assistant - Enhanced Semantic Chunking System*