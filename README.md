# GTI SOP Assistant - Try 2

A simplified web application for downloading DOCX files from Google Docs, built from scratch with a focus on the Google Docs integration functionality.

## Features

- 🔗 **Google Docs Integration**: Connect to Google Docs using document URL or ID
- 📥 **DOCX Download**: Download documents as DOCX files directly to your computer
- 🎨 **Modern UI**: Clean, responsive design with dark theme
- 📱 **Mobile Friendly**: Works on desktop and mobile devices
- ⚡ **Real-time Status**: Live sync status and progress indicators
- 💾 **State Persistence**: Remembers your last synced document

## Quick Start

### Local Development

1. Clone or navigate to this folder
2. Open `index.html` in your browser, or serve it locally:
   ```bash
   python -m http.server 8000
   # Then visit http://localhost:8000
   ```

### Deploy to Vercel

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables in Vercel dashboard:
   ```
   GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
   GOOGLE_PROJECT_ID=your-project-id
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_PRIVATE_KEY_ID=your-key-id
   ```

3. Deploy:
   ```bash
   vercel --prod
   ```

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

## Usage

1. **Enter Document**: Enter your Google Doc information in the input field:
   - Document Name: `"GTI Data Base and SOP"` (searches by exact name)
   - Google Doc URL: `https://docs.google.com/document/d/DOCUMENT_ID/edit`
   - Document ID: `DOCUMENT_ID` (the long string of characters)
2. **Sync**: Click "Sync from Google Docs" to download the document
3. **Download**: Once synced, click "Download DOCX" to save the file to your computer

### Supported Input Formats

- **Document Name**: `"GTI Data Base and SOP"` - The exact name of your Google Doc
- **Google Doc URL**: `https://docs.google.com/document/d/DOCUMENT_ID/edit`
- **Document ID**: `DOCUMENT_ID` (the long alphanumeric string)

**Note**: For document names, make sure the document is shared with your service account email.

## File Structure

```
web_app_try2/
├── index.html              # Main HTML page
├── styles/
│   └── main.css            # Styling
├── js/
│   ├── app.js              # Main application logic
│   └── googleDocsSync.js   # Google Docs integration
├── api/
│   └── google-docs-sync.js # Vercel serverless function
├── package.json            # Dependencies
├── vercel.json            # Vercel configuration
└── README.md              # This file
```

## Environment Variables

For production deployment, set these environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_EMAIL` | Service account email | Yes |
| `GOOGLE_PRIVATE_KEY` | Service account private key | Yes |
| `GOOGLE_PROJECT_ID` | Google Cloud project ID | Yes |
| `GOOGLE_CLIENT_ID` | Service account client ID | Yes |
| `GOOGLE_PRIVATE_KEY_ID` | Private key ID | Yes |

## Troubleshooting

### Common Issues

1. **"Access denied" error**:
   - Make sure your Google Doc is shared with the service account email
   - Verify the service account has the correct permissions

2. **"Document not found" error**:
   - Check that the document ID is correct
   - Ensure the document exists and is accessible

3. **"Invalid credentials" error**:
   - Verify all environment variables are set correctly
   - Check that the private key includes proper newline characters (`\n`)

4. **API quota exceeded**:
   - Google APIs have usage limits
   - Try again after some time or check your quota in Google Cloud Console

### Debug Mode

To enable detailed logging, add this to your browser console:
```javascript
localStorage.setItem('debug', 'true');
```

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details